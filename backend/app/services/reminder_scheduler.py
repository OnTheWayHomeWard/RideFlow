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


def _booking_pickup_dt(booking: Booking) -> datetime:
    """pickup_date + pickup_time, treated as UTC (matches the rest of the codebase)."""
    return datetime.combine(booking.pickup_date, booking.pickup_time, tzinfo=timezone.utc)


async def _candidates_in_window(db: AsyncSession, target_offset: timedelta, sent_column) -> list[Booking]:
    """Bookings whose pickup time is within ±WINDOW_SECONDS of (now + target_offset)
    and which haven't had this particular reminder sent yet."""
    now = datetime.now(timezone.utc)
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
        dt = _booking_pickup_dt(b)
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
    await notify_client_reminder(db, b.client_phone, {
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
    await notify_client_final_reminder(db, b.client_phone, {
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
