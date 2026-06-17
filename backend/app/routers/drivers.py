from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel as PydanticBaseModel
from app.database import get_db
from app.models.driver import Driver
from app.models.booking import Booking
from app.models.payment_split import PaymentSplit
from app.middleware.auth import get_current_driver
from app.utils.security import hash_password as do_hash, verify_password
from app.schemas.driver import (
    DriverRegisterRequest, DriverOut, AvailableRunOut,
    DriverRunOut, DriverEarningsOut, LocationUpdate,
)
from app.utils.security import hash_password

router = APIRouter(prefix="/api/drivers", tags=["drivers"])


# ── Registration (public) ──

@router.post("/register", response_model=DriverOut)
async def register_driver(req: DriverRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Driver self-registration. Status = pending until admin approves."""
    # Check phone uniqueness
    existing = await db.execute(select(Driver).where(Driver.phone == req.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already registered")

    driver = Driver(
        name=req.name,
        phone=req.phone,
        email=req.email,
        password_hash=hash_password(req.password),
        vehicle_type=req.vehicle_type,
        vehicle_make=req.vehicle_make,
        vehicle_plate=req.vehicle_plate,
        vehicle_color=req.vehicle_color,
        license_number=req.license_number,
        license_expiry=req.license_expiry,
        has_insurance=req.has_insurance,
        payout_method=req.payout_method,
        payout_details=req.payout_details,
        status="pending",
    )
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver


# ── Profile (authenticated) ──

@router.get("/me", response_model=DriverOut)
async def get_my_profile(driver: Driver = Depends(get_current_driver)):
    return driver


class DriverChangePassword(PydanticBaseModel):
    current_password: str
    new_password: str


@router.post("/me/change-password")
async def change_password(req: DriverChangePassword, driver: Driver = Depends(get_current_driver), db: AsyncSession = Depends(get_db)):
    if not verify_password(req.current_password, driver.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")
    driver.password_hash = do_hash(req.new_password)
    driver.password_changed = True
    await db.commit()
    return {"message": "Password changed successfully"}



# ── Available Runs ──

@router.get("/available-runs", response_model=list[AvailableRunOut])
async def get_available_runs(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Get all unassigned, paid runs matching this driver's vehicle type.
    Respects driver priority — lower priority drivers see runs with a time delay."""
    # Get delays from settings
    from app.models.setting import Setting as SettingModel
    normal_r = await db.execute(select(SettingModel).where(SettingModel.key == "priority_delay_normal_minutes"))
    normal_setting = normal_r.scalar_one_or_none()
    low_r = await db.execute(select(SettingModel).where(SettingModel.key == "priority_delay_low_minutes"))
    low_setting = low_r.scalar_one_or_none()

    delay_map = {
        1: 0,
        2: int(normal_setting.value) if normal_setting else 2,
        3: int(low_setting.value) if low_setting else 5,
    }
    delay_minutes = delay_map.get(driver.priority_level or 2, 2)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=delay_minutes)

    result = await db.execute(
        select(Booking).where(
            Booking.status == "paid",
            Booking.driver_id.is_(None),
            Booking.vehicle_type == driver.vehicle_type,
            Booking.pickup_date >= date.today(),
            Booking.created_at <= cutoff,
        ).order_by(Booking.pickup_date, Booking.pickup_time)
    )
    bookings = result.scalars().all()

    # Hide runs whose pickup wall-clock is already in the past — drivers
    # cannot accept those. Admin still sees them in /admin/runs.
    from app.utils.timezone import get_business_tz
    biz_tz = await get_business_tz(db)
    now_local = datetime.now(biz_tz)
    bookings = [
        b for b in bookings
        if datetime.combine(b.pickup_date, b.pickup_time, tzinfo=biz_tz) >= now_local
    ]

    # Get driver's pay percentage to calculate earnings
    driver_pct = float(driver.pay_percentage) / 100

    runs = []
    for b in bookings:
        # Calculate what driver earns (never show total fare)
        driver_earnings = round(float(b.base_amount) * driver_pct, 2)
        runs.append(AvailableRunOut(
            id=b.id,
            booking_number=b.booking_number,
            pickup_name=b.pickup_name,
            pickup_address=b.pickup_address,
            dropoff_name=b.dropoff_name,
            dropoff_address=b.dropoff_address,
            pickup_date=b.pickup_date,
            pickup_time=b.pickup_time,
            passengers=b.passengers,
            luggage=b.luggage,
            vehicle_type=b.vehicle_type,
            driver_earnings=driver_earnings,
            extras_chosen=b.extras_chosen,
            client_name=b.client_name,
            client_phone=b.client_phone,
            client_room=b.client_room,
        ))

    return runs


# ── Accept Run ──

@router.post("/runs/{booking_id}/accept")
async def accept_run(
    booking_id: str,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """First-accept-wins. Accept an available run."""
    # Check max active runs limit
    from app.models.setting import Setting
    max_r = await db.execute(select(Setting).where(Setting.key == "max_active_runs_per_driver"))
    max_setting = max_r.scalar_one_or_none()
    max_runs = int(max_setting.value) if max_setting else 5

    active_count_r = await db.execute(
        select(func.count()).select_from(Booking).where(
            Booking.driver_id == driver.id,
            Booking.status.in_(["assigned", "in_progress"]),
        )
    )
    active_count = active_count_r.scalar()

    if active_count >= max_runs:
        raise HTTPException(
            status_code=400,
            detail=f"You already have {active_count} active runs. Maximum allowed is {max_runs}. Complete some runs before accepting new ones.",
        )

    result = await db.execute(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.status == "paid",
            Booking.driver_id.is_(None),
            Booking.vehicle_type == driver.vehicle_type,
        )
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(
            status_code=400,
            detail="Run not available — already taken or doesn't match your vehicle",
        )

    # Past-pickup gate — drivers cannot accept rides whose pickup time has
    # already passed. Only admins handle stale runs (reassign / cancel /
    # refund manually). Compares the booking's wall-clock pickup against
    # "now" in the business timezone.
    from app.utils.timezone import get_business_tz
    biz_tz = await get_business_tz(db)
    pickup_dt = datetime.combine(booking.pickup_date, booking.pickup_time, tzinfo=biz_tz)
    if pickup_dt < datetime.now(biz_tz):
        raise HTTPException(
            status_code=400,
            detail="Pickup time for this run has already passed. Only an admin can handle it now.",
        )

    # Assign to this driver
    booking.driver_id = driver.id
    booking.status = "assigned"
    booking.assigned_at = datetime.now(timezone.utc)

    # Update driver split with actual driver ID
    split_result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.booking_id == booking.id,
            PaymentSplit.recipient_type == "driver",
        )
    )
    driver_split = split_result.scalar_one_or_none()
    if driver_split:
        driver_split.recipient_id = driver.id
        # Recalculate based on this driver's actual percentage
        driver_pct = float(driver.pay_percentage) / 100
        driver_split.amount = round(float(booking.base_amount) * driver_pct, 2)
        driver_split.percentage = float(driver.pay_percentage)

        # Recalculate company split
        company_result = await db.execute(
            select(PaymentSplit).where(
                PaymentSplit.booking_id == booking.id,
                PaymentSplit.recipient_type == "company",
            )
        )
        company_split = company_result.scalar_one_or_none()
        if company_split:
            cashier_result = await db.execute(
                select(PaymentSplit).where(
                    PaymentSplit.booking_id == booking.id,
                    PaymentSplit.recipient_type == "cashier",
                )
            )
            cashier_split = cashier_result.scalar_one_or_none()
            cashier_amount = float(cashier_split.amount) if cashier_split else 0
            company_split.amount = round(float(booking.total_amount) - cashier_amount - driver_split.amount, 2)

    await db.commit()

    # Send SMS to driver (after commit)
    try:
        from app.services.sms_service import notify_driver_new_run
        driver_pct_val = float(driver.pay_percentage) / 100
        driver_earn = round(float(booking.base_amount) * driver_pct_val, 2)
        await notify_driver_new_run(db, driver.phone, {
            "driver_name": driver.name,
            "pickup_name": booking.pickup_name,
            "dropoff_name": booking.dropoff_name,
            "pickup_date": str(booking.pickup_date),
            "pickup_time": str(booking.pickup_time)[:5],
            "client_name": booking.client_name,
            "driver_earnings": f"{driver_earn:.2f}",
            "booking_number": booking.booking_number,
        })
        await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] Driver new run SMS failed: {e}")

    # Notify admins (in-app + FCM)
    try:
        from app.services.notifications_service import notify_all_admins
        await notify_all_admins(
            db,
            kind="driver_accepted",
            title=f"{driver.name} accepted {booking.booking_number}",
            body=f"{booking.pickup_name} → {booking.dropoff_name} ({booking.pickup_date} {str(booking.pickup_time)[:5]})",
            link=f"/admin/runs/{booking.id}",
            related_type="booking",
            related_id=booking.id,
        )
    except Exception as e:
        print(f"[notify] driver_accepted: {e}")

    return {
        "message": "Run accepted",
        "booking_number": booking.booking_number,
        "pickup_name": booking.pickup_name,
        "dropoff_name": booking.dropoff_name,
        "pickup_date": str(booking.pickup_date),
        "pickup_time": str(booking.pickup_time),
    }


# ── Driver action notifications (courtesy SMS to client, manual buttons) ──

@router.post("/runs/{booking_id}/on-way")
async def driver_on_way(
    booking_id: str,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Driver tapped 'On my way'. Marks timestamp + sends courtesy SMS to client.
    Idempotent — calling again is a no-op."""
    r = await db.execute(select(Booking).where(
        Booking.id == booking_id,
        Booking.driver_id == driver.id,
        Booking.status.in_(("assigned", "paid")),
    ))
    booking = r.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Run not found or not assigned to you")

    if booking.driver_on_way_at:
        return {"already_sent": True, "sent_at": booking.driver_on_way_at.isoformat()}

    booking.driver_on_way_at = datetime.now(timezone.utc)
    await db.commit()

    try:
        from app.services.sms_service import notify_driver_on_way
        await notify_driver_on_way(db, booking, {
            "client_name": booking.client_name,
            "driver_name": driver.name,
            "driver_phone": driver.phone,
            "pickup_name": booking.pickup_name,
            "dropoff_name": booking.dropoff_name,
            "vehicle_type": booking.vehicle_type,
            "booking_number": booking.booking_number,
        })
        await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] driver_on_way for {booking.booking_number}: {e}")

    return {"sent": True, "sent_at": booking.driver_on_way_at.isoformat()}


@router.post("/runs/{booking_id}/arrived")
async def driver_arrived(
    booking_id: str,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Driver tapped 'I've arrived'. Marks timestamp + sends courtesy SMS to client.
    Idempotent."""
    r = await db.execute(select(Booking).where(
        Booking.id == booking_id,
        Booking.driver_id == driver.id,
        Booking.status.in_(("assigned", "paid")),
    ))
    booking = r.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Run not found or not assigned to you")

    if booking.driver_arrived_at:
        return {"already_sent": True, "sent_at": booking.driver_arrived_at.isoformat()}

    booking.driver_arrived_at = datetime.now(timezone.utc)
    await db.commit()

    try:
        from app.services.sms_service import notify_driver_arrived
        await notify_driver_arrived(db, booking, {
            "client_name": booking.client_name,
            "driver_name": driver.name,
            "driver_phone": driver.phone,
            "pickup_name": booking.pickup_name,
            "dropoff_name": booking.dropoff_name,
            "vehicle_type": booking.vehicle_type,
            "booking_number": booking.booking_number,
        })
        await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] driver_arrived for {booking.booking_number}: {e}")

    return {"sent": True, "sent_at": booking.driver_arrived_at.isoformat()}


# ── Start Ride ──

@router.post("/runs/{booking_id}/start")
async def start_ride(
    booking_id: str,
    location: LocationUpdate,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Driver taps Start Ride — records GPS and timestamp."""
    result = await db.execute(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.driver_id == driver.id,
            Booking.status == "assigned",
        )
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=400, detail="Run not found or not in the right status")

    booking.status = "in_progress"
    booking.started_at = datetime.now(timezone.utc)
    booking.start_location = {"lat": location.lat, "lng": location.lng}

    # Log notification for admin
    from app.models.notification_log import NotificationLog
    db.add(NotificationLog(
        recipient="admin",
        channel="in_app",
        message=f"Ride started: {driver.name} picked up {booking.client_name} ({booking.pickup_name} → {booking.dropoff_name})",
        status="sent",
        related_type="ride_started",
    ))

    await db.commit()

    # Send SMS to client with rating link (after commit)
    try:
        from app.services.sms_service import notify_client_ride_started
        from app.utils.urls import get_client_base_url
        confirmation_url = f"{await get_client_base_url(db)}/confirmation/{booking.booking_number}"
        await notify_client_ride_started(db, booking, {
            "client_name": booking.client_name,
            "driver_name": driver.name,
            "pickup_name": booking.pickup_name,
            "dropoff_name": booking.dropoff_name,
            "booking_number": booking.booking_number,
            "confirmation_url": confirmation_url,
        })
        await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] Client ride started SMS failed: {e}")

    # Notify admins
    try:
        from app.services.notifications_service import notify_all_admins
        await notify_all_admins(
            db,
            kind="ride_started",
            title=f"Ride started — {booking.booking_number}",
            body=f"{driver.name} picked up {booking.client_name} ({booking.pickup_name} → {booking.dropoff_name})",
            link=f"/admin/runs/{booking.id}",
            related_type="booking",
            related_id=booking.id,
        )
    except Exception as e:
        print(f"[notify] ride_started: {e}")

    return {"message": "Ride started", "booking_number": booking.booking_number}


# ── Complete Ride ──

@router.post("/runs/{booking_id}/complete")
async def complete_ride(
    booking_id: str,
    location: LocationUpdate,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """
    Driver taps Complete Ride.
    - Records GPS and timestamp
    - Sets booking to completed
    - Sets driver payout split to pending_review (admin must release)
    """
    result = await db.execute(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.driver_id == driver.id,
            Booking.status == "in_progress",
        )
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=400, detail="Run not found or not in progress")

    booking.status = "completed"
    booking.completed_at = datetime.now(timezone.utc)
    booking.end_location = {"lat": location.lat, "lng": location.lng}

    # Update driver stats
    driver.total_rides = (driver.total_rides or 0) + 1

    # Set driver payout to pending_review (admin must release)
    split_result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.booking_id == booking.id,
            PaymentSplit.recipient_type == "driver",
        )
    )
    driver_split = split_result.scalar_one_or_none()
    if driver_split:
        driver_split.payout_status = "pending_review"

    await db.commit()

    # Send SMS to driver (after commit so DB is clean)
    try:
        from app.services.sms_service import notify_driver_ride_completed
        d_earnings = float(driver_split.amount) if driver_split else 0
        await notify_driver_ride_completed(db, driver.phone, {
            "driver_name": driver.name,
            "pickup_name": booking.pickup_name,
            "dropoff_name": booking.dropoff_name,
            "driver_earnings": f"{d_earnings:.2f}",
            "booking_number": booking.booking_number,
        })
        await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] Driver ride completed SMS failed: {e}")

    # Send thank-you + feedback SMS to client
    try:
        from app.services.sms_service import notify_client_ride_completed
        from app.utils.urls import get_client_base_url
        confirmation_url = f"{await get_client_base_url(db)}/confirmation/{booking.booking_number}"
        await notify_client_ride_completed(db, booking, {
            "client_name": booking.client_name,
            "driver_name": driver.name,
            "pickup_name": booking.pickup_name,
            "dropoff_name": booking.dropoff_name,
            "booking_number": booking.booking_number,
            "confirmation_url": confirmation_url,
        })
        await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] Client ride completed SMS failed: {e}")

    # Notify admins
    try:
        from app.services.notifications_service import notify_all_admins
        await notify_all_admins(
            db,
            kind="ride_completed",
            title=f"Ride completed — {booking.booking_number}",
            body=f"{driver.name} finished {booking.client_name}'s ride ({booking.pickup_name} → {booking.dropoff_name})",
            link=f"/admin/runs/{booking.id}",
            related_type="booking",
            related_id=booking.id,
        )
    except Exception as e:
        print(f"[notify] ride_completed: {e}")

    earnings = float(driver_split.amount) if driver_split else 0

    return {
        "message": "Ride completed. Payout pending verification.",
        "booking_number": booking.booking_number,
        "your_earnings": earnings,
        "payout_status": "pending_review",
    }


# ── My Runs (schedule + history) ──

@router.get("/my-runs", response_model=list[DriverRunOut])
async def get_my_runs(
    status: str | None = None,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Get driver's runs. Filter by status: assigned, in_progress, completed, or all."""
    query = select(Booking).where(Booking.driver_id == driver.id)
    if status:
        query = query.where(Booking.status == status)
    query = query.order_by(Booking.pickup_date.desc(), Booking.pickup_time.desc())

    result = await db.execute(query)
    bookings = result.scalars().all()

    driver_pct = float(driver.pay_percentage) / 100
    runs = []
    for b in bookings:
        # Get payout status for this run
        split_result = await db.execute(
            select(PaymentSplit).where(
                PaymentSplit.booking_id == b.id,
                PaymentSplit.recipient_type == "driver",
            )
        )
        split = split_result.scalar_one_or_none()
        payout_status = split.payout_status if split else None
        driver_earnings = float(split.amount) if split else round(float(b.base_amount) * driver_pct, 2)

        runs.append(DriverRunOut(
            id=b.id,
            booking_number=b.booking_number,
            pickup_name=b.pickup_name,
            pickup_address=b.pickup_address,
            dropoff_name=b.dropoff_name,
            dropoff_address=b.dropoff_address,
            pickup_date=b.pickup_date,
            pickup_time=b.pickup_time,
            passengers=b.passengers,
            luggage=b.luggage,
            vehicle_type=b.vehicle_type,
            client_name=b.client_name,
            client_phone=b.client_phone,
            client_room=b.client_room,
            driver_earnings=driver_earnings,
            status=b.status,
            started_at=b.started_at,
            completed_at=b.completed_at,
            payout_status=payout_status,
        ))

    return runs


@router.get("/schedule", response_model=list[DriverRunOut])
async def get_schedule(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Get upcoming runs (assigned, not yet completed)."""
    result = await db.execute(
        select(Booking).where(
            Booking.driver_id == driver.id,
            Booking.status.in_(["assigned", "in_progress"]),
        ).order_by(Booking.pickup_date, Booking.pickup_time)
    )
    bookings = result.scalars().all()

    driver_pct = float(driver.pay_percentage) / 100
    runs = []
    for b in bookings:
        split_result = await db.execute(
            select(PaymentSplit).where(
                PaymentSplit.booking_id == b.id,
                PaymentSplit.recipient_type == "driver",
            )
        )
        split = split_result.scalar_one_or_none()
        driver_earnings = float(split.amount) if split else round(float(b.base_amount) * driver_pct, 2)

        runs.append(DriverRunOut(
            id=b.id,
            booking_number=b.booking_number,
            pickup_name=b.pickup_name,
            pickup_address=b.pickup_address,
            dropoff_name=b.dropoff_name,
            dropoff_address=b.dropoff_address,
            pickup_date=b.pickup_date,
            pickup_time=b.pickup_time,
            passengers=b.passengers,
            luggage=b.luggage,
            vehicle_type=b.vehicle_type,
            client_name=b.client_name,
            client_phone=b.client_phone,
            client_room=b.client_room,
            driver_earnings=driver_earnings,
            status=b.status,
            started_at=b.started_at,
            completed_at=b.completed_at,
            payout_status=None,
        ))

    return runs


# ── Earnings ──

@router.get("/earnings", response_model=DriverEarningsOut)
async def get_earnings(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Get driver's earnings summary — only their cut, never the total fare."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    async def earnings_for_period(start_date):
        result = await db.execute(
            select(
                func.coalesce(func.sum(PaymentSplit.amount), 0),
                func.count(PaymentSplit.id),
            ).join(Booking, PaymentSplit.booking_id == Booking.id).where(
                PaymentSplit.recipient_type == "driver",
                PaymentSplit.recipient_id == driver.id,
                Booking.completed_at.isnot(None),
                Booking.pickup_date >= start_date,
            )
        )
        row = result.one()
        return float(row[0]), int(row[1])

    today_earnings, today_rides = await earnings_for_period(today)
    week_earnings, week_rides = await earnings_for_period(week_start)
    month_earnings, month_rides = await earnings_for_period(month_start)

    return DriverEarningsOut(
        today=today_earnings,
        today_rides=today_rides,
        this_week=week_earnings,
        this_week_rides=week_rides,
        this_month=month_earnings,
        this_month_rides=month_rides,
    )


# ═══════════════════════════════════════════
# STRIPE CONNECT
# ═══════════════════════════════════════════

@router.post("/stripe/connect")
async def stripe_connect(driver: Driver = Depends(get_current_driver), db: AsyncSession = Depends(get_db)):
    """Start Stripe Connect onboarding. Creates Express account if needed."""
    from app.services.connect_service import create_connect_account, create_onboarding_link, get_account_details

    if not driver.stripe_connect_id:
        acct_id = await create_connect_account("driver", driver.id, driver.email)
        driver.stripe_connect_id = acct_id
        driver.payout_method = "stripe_connect"
        await db.flush()
    else:
        acct_id = driver.stripe_connect_id

    # Check if already fully set up
    details = await get_account_details(acct_id)
    if details.get("charges_enabled") and details.get("payouts_enabled"):
        driver.payout_details = details
        await db.commit()
        return {"already_connected": True, "account_id": acct_id, "details": details}

    from app.utils.urls import get_staff_base_url
    staff_base = await get_staff_base_url(db)
    return_url = f"{staff_base}/driver/profile?stripe=complete"
    refresh_url = f"{staff_base}/driver/profile?stripe=refresh"
    url = await create_onboarding_link(acct_id, return_url, refresh_url)

    await db.commit()
    return {"onboarding_url": url, "account_id": acct_id}


@router.get("/stripe/status")
async def stripe_status(driver: Driver = Depends(get_current_driver), db: AsyncSession = Depends(get_db)):
    """Check Stripe Connect status."""
    if not driver.stripe_connect_id:
        return {"connected": False}

    from app.services.connect_service import get_account_details
    details = await get_account_details(driver.stripe_connect_id)

    # Update stored details
    driver.payout_details = details
    await db.commit()

    return {
        "connected": True,
        "charges_enabled": details.get("charges_enabled", False),
        "payouts_enabled": details.get("payouts_enabled", False),
        "details_submitted": details.get("details_submitted", False),
        "account_id": driver.stripe_connect_id,
        "name": details.get("name"),
        "email": details.get("email"),
        "bank_last4": details.get("bank_last4"),
        "bank_name": details.get("bank_name"),
    }


@router.post("/stripe/onboarding-link")
async def stripe_onboarding_link(driver: Driver = Depends(get_current_driver), db: AsyncSession = Depends(get_db)):
    """Get a fresh onboarding link (for incomplete setups)."""
    if not driver.stripe_connect_id:
        raise HTTPException(status_code=400, detail="No Stripe account found. Use /stripe/connect first.")

    from app.services.connect_service import create_onboarding_link
    from app.utils.urls import get_staff_base_url
    staff_base = await get_staff_base_url(db)
    url = await create_onboarding_link(
        driver.stripe_connect_id,
        f"{staff_base}/driver/profile?stripe=complete",
        f"{staff_base}/driver/profile?stripe=refresh",
    )
    return {"onboarding_url": url}
