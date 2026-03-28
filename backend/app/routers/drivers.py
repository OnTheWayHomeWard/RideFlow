from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.driver import Driver
from app.models.booking import Booking
from app.models.payment_split import PaymentSplit
from app.middleware.auth import get_current_driver
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


@router.put("/me/online")
async def toggle_online(
    online: bool,
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Toggle driver online/offline status."""
    driver.is_online = online
    if online:
        driver.last_online_at = datetime.now(timezone.utc)
    await db.commit()
    return {"is_online": driver.is_online}


# ── Available Runs ──

@router.get("/available-runs", response_model=list[AvailableRunOut])
async def get_available_runs(
    driver: Driver = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Get all unassigned, paid runs matching this driver's vehicle type."""
    result = await db.execute(
        select(Booking).where(
            Booking.status == "paid",
            Booking.driver_id.is_(None),
            Booking.vehicle_type == driver.vehicle_type,
            Booking.pickup_date >= date.today(),
        ).order_by(Booking.pickup_date, Booking.pickup_time)
    )
    bookings = result.scalars().all()

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

    return {
        "message": "Run accepted",
        "booking_number": booking.booking_number,
        "pickup_name": booking.pickup_name,
        "dropoff_name": booking.dropoff_name,
        "pickup_date": str(booking.pickup_date),
        "pickup_time": str(booking.pickup_time),
    }


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

    await db.commit()

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
