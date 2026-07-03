"""
In-process reminder scheduler.

Wakes up every 60 seconds and dispatches three kinds of reminders for upcoming
bookings whose pickup time falls in a small window around the configured offset:

  - client_reminder_hours      → SMS to client X hours before pickup
  - client_final_reminder_minutes → SMS to client X minutes before pickup
  - driver_reminder_hours      → SMS to driver X hours before pickup (only if assigned)

Each reminder is gated by a per-booking `*_sent_at` timestamp so it can never
fire twice. A `0` value for any setting disables that reminder entirely.

Runs as a background task started in the FastAPI lifespan; cancelled cleanly
on shutdown.
"""
import asyncio
import traceback
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.setting import Setting
from app.utils.urls import get_client_base_url
from app.utils.timezone import get_business_tz


# How often the scheduler ticks. The matching window below covers ±90s so a
# missed tick (e.g. backend restart) still catches reminders.
TICK_SECONDS = 60
WINDOW_SECONDS = 90  # match if pickup_dt is within ±90s of (now + offset)

# Statuses that are "still upcoming" — cancelled / completed are skipped.
ACTIVE_STATUSES = ("paid", "assigned")


async def _get_setting_float(db: AsyncSession, key: str, default: float) -> float:
    r = await db.execute(select(Setting).where(Setting.key == key))
    s = r.scalar_one_or_none()
    if not s or s.value in (None, ""):
        return default
    try:
        return float(s.value)
    except (TypeError, ValueError):
        return default


def _booking_pickup_dt(booking: Booking, biz_tz) -> datetime:
    """pickup_date + pickup_time are stored as the rider's wall-clock pickup in
    the configured business timezone (Eastern by default). Tag accordingly."""
    return datetime.combine(booking.pickup_date, booking.pickup_time, tzinfo=biz_tz)


async def _candidates_in_window(db: AsyncSession, target_offset: timedelta, sent_column) -> list[Booking]:
    """Bookings whose pickup time is within ±WINDOW_SECONDS of (now + target_offset)
    and which haven't had this particular reminder sent yet."""
    biz_tz = await get_business_tz(db)
    now = datetime.now(biz_tz)
    target = now + target_offset
    win = timedelta(seconds=WINDOW_SECONDS)
    earliest = target - win
    latest = target + win

    # We can't combine pickup_date + pickup_time in SQL portably, so fetch a coarse
    # candidate set (any booking on the target date or the day before to handle
    # midnight wraps) and filter in Python.
    target_date = target.date()
    earliest_date = earliest.date()
    latest_date = latest.date()
    date_set = {earliest_date, target_date, latest_date}

    r = await db.execute(
        select(Booking).where(
            and_(
                Booking.status.in_(ACTIVE_STATUSES),
                sent_column.is_(None),
                Booking.pickup_date.in_(date_set),
            )
        )
    )
    bookings = []
    for b in r.scalars().all():
        dt = _booking_pickup_dt(b, biz_tz)
        if earliest <= dt <= latest:
            bookings.append(b)
    return bookings


async def _send_client_reminder(db: AsyncSession, b: Booking, hours: float):
    from app.services.sms_service import notify_client_reminder
    driver_name = ""
    if b.driver_id:
        dr = await db.execute(select(Driver).where(Driver.id == b.driver_id))
        d = dr.scalar_one_or_none()
        if d:
            driver_name = d.name
    confirmation_url = f"{await get_client_base_url(db)}/confirmation/{b.booking_number}"
    hours_str = f"{int(hours)}" if hours == int(hours) else f"{hours:g}"
    await notify_client_reminder(db, b, {
        "client_name": b.client_name,
        "driver_name": driver_name,
        "pickup_name": b.pickup_name,
        "dropoff_name": b.dropoff_name,
        "pickup_time": str(b.pickup_time)[:5],
        "hours": hours_str,
        "confirmation_url": confirmation_url,
        "booking_number": b.booking_number,
    })
    b.client_reminder_sent_at = datetime.now(timezone.utc)


async def _send_client_final_reminder(db: AsyncSession, b: Booking, minutes: int):
    from app.services.sms_service import notify_client_final_reminder
    driver_name = ""
    if b.driver_id:
        dr = await db.execute(select(Driver).where(Driver.id == b.driver_id))
        d = dr.scalar_one_or_none()
        if d:
            driver_name = d.name
    confirmation_url = f"{await get_client_base_url(db)}/confirmation/{b.booking_number}"
    await notify_client_final_reminder(db, b, {
        "client_name": b.client_name,
        "driver_name": driver_name,
        "pickup_name": b.pickup_name,
        "dropoff_name": b.dropoff_name,
        "minutes": str(minutes),
        "confirmation_url": confirmation_url,
        "booking_number": b.booking_number,
    })
    b.client_final_reminder_sent_at = datetime.now(timezone.utc)


async def _send_driver_reminder(db: AsyncSession, b: Booking, driver: Driver, hours: float):
    from app.services.sms_service import notify_driver_reminder
    hours_str = f"{int(hours)}" if hours == int(hours) else f"{hours:g}"
    await notify_driver_reminder(db, driver.phone, {
        "driver_name": driver.name,
        "client_name": b.client_name,
        "client_phone": b.client_phone,
        "pickup_name": b.pickup_name,
        "dropoff_name": b.dropoff_name,
        "pickup_time": str(b.pickup_time)[:5],
        "hours": hours_str,
        "vehicle_type": b.vehicle_type,
        "booking_number": b.booking_number,
    })
    b.driver_reminder_sent_at = datetime.now(timezone.utc)


async def _dispatch_new_run_alerts(db: AsyncSession) -> None:
    """Fan out "new run available" alerts to drivers as each priority tier's
    delay window elapses.

    Logic:
      - Level-1 (high) drivers: alerted the moment the booking is paid.
      - Level-2 (normal) drivers: alerted after `priority_delay_normal_minutes`.
      - Level-3 (low)    drivers: alerted after `priority_delay_low_minutes`.

    Each (driver, booking) pair is de-duplicated via the notifications table
    (kind='run_available' + related_id=booking.id + recipient), so a slow tick
    or a scheduler restart can't spam the fleet twice.

    Runs alongside the reminder queries because we already have a 60s tick
    and a live async session — no new worker required.
    """
    from app.models.notification import Notification
    from app.models.cashier import Cashier  # noqa: F401 — silences relationship warnings on first import in this module

    # Delays keyed by priority level. Level 1 fires instantly; the two configurable
    # values come from admin Settings so ops can tune them without a redeploy.
    normal_delay = int(await _get_setting_float(db, "priority_delay_normal_minutes", 2.0))
    low_delay = int(await _get_setting_float(db, "priority_delay_low_minutes", 5.0))
    delay_map = {1: 0, 2: normal_delay, 3: low_delay}

    # SMS side is gated by a setting — in-app + FCM always fire so drivers with
    # notifications off still see the badge when they open the app.
    sms_row = await db.execute(select(Setting).where(Setting.key == "notify_driver_new_run_sms_enabled"))
    sms_setting = sms_row.scalar_one_or_none()
    sms_enabled = str(sms_setting.value if sms_setting else True).lower() in ("true", "1", "yes")

    # Only consider recently-paid, still-unassigned bookings — cap at 24h back to
    # keep the tick cheap and avoid re-alerting on rides that quietly slipped
    # into the past without being accepted (past-pickup gate hides them anyway).
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)
    booking_r = await db.execute(
        select(Booking).where(
            Booking.status == "paid",
            Booking.driver_id.is_(None),
            Booking.paid_at >= cutoff,
        )
    )
    bookings = booking_r.scalars().all()
    if not bookings:
        return

    # Pool matching drivers up front so we do one lookup per vehicle type instead
    # of one per booking. Only active drivers with a phone/token.
    from collections import defaultdict
    vt_needed = {b.vehicle_type for b in bookings}
    drivers_by_vt: dict[str, list[Driver]] = defaultdict(list)
    if vt_needed:
        dr = await db.execute(
            select(Driver).where(
                Driver.vehicle_type.in_(vt_needed),
                Driver.status == "active",
            )
        )
        for d in dr.scalars().all():
            drivers_by_vt[d.vehicle_type].append(d)

    if not drivers_by_vt:
        return

    from app.services.notifications_service import notify as notify_inapp
    from app.services.sms_service import notify_driver_run_available
    from app.utils.urls import get_staff_base_url

    # Best-effort resolve of the staff app URL for the SMS link; falls back to
    # a relative path if the setting isn't populated (rare — but harmless).
    try:
        staff_base = (await get_staff_base_url(db) or "").rstrip("/")
    except Exception:
        staff_base = ""

    for b in bookings:
        candidates = drivers_by_vt.get(b.vehicle_type, [])
        if not candidates:
            continue

        # For each candidate, gate by their own priority delay and by whether
        # we've already alerted them for THIS booking.
        for driver in candidates:
            level = driver.priority_level or 2
            delay_min = delay_map.get(level, normal_delay)
            unlock_time = (b.paid_at or b.created_at or now) + timedelta(minutes=delay_min)
            if now < unlock_time:
                continue  # still in their delay window

            # Dedup — if we've already recorded a run-available notification
            # for this (driver, booking) pair, skip.
            existing = await db.execute(
                select(Notification.id).where(
                    Notification.recipient_type == "driver",
                    Notification.recipient_id == driver.id,
                    Notification.kind == "run_available",
                    Notification.related_id == b.id,
                )
            )
            if existing.scalar_one_or_none():
                continue

            # Driver earnings — same formula as GET /available-runs so what the
            # SMS says matches what they see in the app.
            driver_pct = float(driver.pay_percentage or 0) / 100
            earnings = round(float(b.base_amount) * driver_pct, 2)

            # 1) In-app + FCM (always). notify() handles both.
            try:
                await notify_inapp(
                    db,
                    recipient_type="driver",
                    recipient_id=driver.id,
                    kind="run_available",
                    title=f"New run available — earn ${earnings:.2f}",
                    body=f"{b.pickup_name} → {b.dropoff_name} on {b.pickup_date} at {str(b.pickup_time)[:5]}. Tap to grab it.",
                    link=f"/driver/run-detail/{b.id}",
                    related_type="booking",
                    related_id=b.id,
                )
            except Exception as e:
                print(f"[scheduler] run_available in-app for {driver.name}/{b.booking_number} failed: {e}")
                # Even if the row insert failed, don't retry SMS immediately —
                # next tick will retry both, and dedup will still catch it.
                continue

            # 2) SMS — best-effort, only if the master toggle is on.
            if sms_enabled and driver.phone:
                try:
                    app_url = f"{staff_base}/driver/run-detail/{b.id}" if staff_base else f"/driver/run-detail/{b.id}"
                    await notify_driver_run_available(db, driver.phone, {
                        "driver_name": driver.name,
                        "vehicle_type": b.vehicle_type.replace("_", " ").upper(),
                        "pickup_name": b.pickup_name,
                        "dropoff_name": b.dropoff_name,
                        "pickup_date": str(b.pickup_date),
                        "pickup_time": str(b.pickup_time)[:5],
                        "driver_earnings": f"{earnings:.2f}",
                        "app_url": app_url,
                        "booking_number": b.booking_number,
                    })
                except Exception as e:
                    print(f"[scheduler] run_available SMS for {driver.name}/{b.booking_number} failed: {e}")

    await db.commit()


async def tick():
    """One pass over the three reminder queries. Safe to call concurrently
    with itself (each reminder is idempotency-keyed)."""
    async with async_session() as db:
        client_hours = await _get_setting_float(db, "client_reminder_hours", 1.0)
        client_final_minutes = await _get_setting_float(db, "client_final_reminder_minutes", 15.0)
        driver_hours = await _get_setting_float(db, "driver_reminder_hours", 2.0)

        # Client X-hour reminder
        if client_hours > 0:
            for b in await _candidates_in_window(db, timedelta(hours=client_hours), Booking.client_reminder_sent_at):
                try:
                    await _send_client_reminder(db, b, client_hours)
                except Exception as e:
                    print(f"[scheduler] client reminder for {b.booking_number} failed: {e}")
            await db.commit()

        # Client final 'X minutes' reminder
        if client_final_minutes > 0:
            for b in await _candidates_in_window(db, timedelta(minutes=client_final_minutes), Booking.client_final_reminder_sent_at):
                try:
                    await _send_client_final_reminder(db, b, int(client_final_minutes))
                except Exception as e:
                    print(f"[scheduler] client final reminder for {b.booking_number} failed: {e}")
            await db.commit()

        # Driver X-hour reminder (skip bookings without an assigned driver)
        if driver_hours > 0:
            for b in await _candidates_in_window(db, timedelta(hours=driver_hours), Booking.driver_reminder_sent_at):
                if not b.driver_id:
                    continue
                dr = await db.execute(select(Driver).where(Driver.id == b.driver_id))
                d = dr.scalar_one_or_none()
                if not d:
                    continue
                try:
                    await _send_driver_reminder(db, b, d, driver_hours)
                except Exception as e:
                    print(f"[scheduler] driver reminder for {b.booking_number} failed: {e}")
            await db.commit()

        # New-run alerts — fires SMS + in-app to matching drivers as each
        # priority tier's delay window elapses. Wrapped independently so a
        # broken dispatch doesn't take out the reminder queries.
        try:
            await _dispatch_new_run_alerts(db)
        except Exception as e:
            print(f"[scheduler] new-run dispatch failed: {e}")


async def _loop():
    while True:
        try:
            await tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            print("[scheduler] tick error:")
            traceback.print_exc()
        await asyncio.sleep(TICK_SECONDS)


_task: asyncio.Task | None = None


def start():
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())
        print("[scheduler] reminder loop started")


async def stop():
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    _task = None
