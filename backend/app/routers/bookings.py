from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.cashier import Cashier
from app.models.driver import Driver
from app.models.rating import Rating
from app.schemas.booking import BookingCreateRequest, BookingOut, BookingStatusOut
from app.services.pricing_service import calculate_price
from app.services.geofence_service import validate_location
from app.utils.helpers import generate_booking_number

router = APIRouter(prefix="/api", tags=["bookings"])


@router.post("/bookings", response_model=BookingOut)
async def create_booking(req: BookingCreateRequest, db: AsyncSession = Depends(get_db)):
    """Create a new booking. Called after client fills the form (before payment)."""

    # Validate geofence
    pickup_ok = await validate_location(db, req.pickup_lat, req.pickup_lng)
    if not pickup_ok:
        raise HTTPException(status_code=400, detail="Pickup location is outside our service area")

    dropoff_ok = await validate_location(db, req.dropoff_lat, req.dropoff_lng)
    if not dropoff_ok:
        raise HTTPException(status_code=400, detail="Destination is outside our service area")

    # Calculate price
    try:
        price = await calculate_price(
            db, req.pickup_lat, req.pickup_lng,
            req.dropoff_lat, req.dropoff_lng,
            req.vehicle_type, req.extras,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Resolve cashier if ref code provided
    cashier_id = None
    hotel_id = None
    if req.cashier_ref_code:
        result = await db.execute(
            select(Cashier).where(
                Cashier.ref_code == req.cashier_ref_code,
                Cashier.status == "active",
            )
        )
        cashier = result.scalar_one_or_none()
        if cashier:
            cashier_id = cashier.id
            hotel_id = cashier.hotel_id

    # Generate unique booking number
    booking_number = generate_booking_number()
    # Ensure uniqueness
    while True:
        existing = await db.execute(
            select(Booking.id).where(Booking.booking_number == booking_number)
        )
        if not existing.scalar_one_or_none():
            break
        booking_number = generate_booking_number()

    # Create booking
    booking = Booking(
        booking_number=booking_number,
        client_name=req.client_name,
        client_phone=req.client_phone,
        client_room=req.client_room,
        pickup_name=req.pickup_name,
        pickup_address=req.pickup_address,
        pickup_lat=req.pickup_lat,
        pickup_lng=req.pickup_lng,
        dropoff_name=req.dropoff_name,
        dropoff_address=req.dropoff_address,
        dropoff_lat=req.dropoff_lat,
        dropoff_lng=req.dropoff_lng,
        distance_miles=price["distance_miles"],
        pickup_date=req.pickup_date,
        pickup_time=req.pickup_time,
        passengers=req.passengers,
        luggage=req.luggage,
        vehicle_type=req.vehicle_type,
        base_amount=price["base_amount"],
        extras_amount=price["extras_amount"],
        upsale_amount=price["upsale_amount"],
        total_amount=price["total_amount"],
        common_route_id=price["common_route_id"],
        upsale_id=price["upsale_id"],
        extras_chosen=req.extras if req.extras else None,
        cashier_id=cashier_id,
        hotel_id=hotel_id,
        status="pending",
    )

    db.add(booking)
    await db.commit()
    await db.refresh(booking)

    return booking


@router.get("/bookings/{booking_number}/status", response_model=BookingStatusOut)
async def get_booking_status(booking_number: str, db: AsyncSession = Depends(get_db)):
    """Check booking status. Used by confirmation page and client SMS links."""
    result = await db.execute(
        select(Booking).where(Booking.booking_number == booking_number)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Get driver info if assigned
    driver_name = None
    driver_vehicle = None
    driver_plate = None
    driver_color = None
    driver_phone = None

    if booking.driver_id:
        driver_result = await db.execute(
            select(Driver).where(Driver.id == booking.driver_id)
        )
        driver = driver_result.scalar_one_or_none()
        if driver:
            driver_name = driver.name
            driver_vehicle = f"{driver.vehicle_make}" if driver.vehicle_make else None
            driver_plate = driver.vehicle_plate
            driver_color = driver.vehicle_color
            driver_phone = driver.phone

    return BookingStatusOut(
        booking_number=booking.booking_number,
        status=booking.status,
        vehicle_type=booking.vehicle_type,
        pickup_name=booking.pickup_name,
        dropoff_name=booking.dropoff_name,
        pickup_date=booking.pickup_date,
        pickup_time=booking.pickup_time,
        total_amount=float(booking.total_amount),
        driver_name=driver_name,
        driver_vehicle=driver_vehicle,
        driver_plate=driver_plate,
        driver_color=driver_color,
        driver_phone=driver_phone,
        has_rated=bool((await db.execute(select(Rating).where(Rating.booking_id == booking.id))).scalar_one_or_none()),
    )


class RatingRequest(BaseModel):
    rating: int
    comment: str = ""


@router.post("/bookings/{booking_number}/rate")
async def rate_booking(booking_number: str, req: RatingRequest, db: AsyncSession = Depends(get_db)):
    """Client rates a completed/in-progress ride. Only one rating per booking."""
    result = await db.execute(select(Booking).where(Booking.booking_number == booking_number))
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status not in ("in_progress", "completed"):
        raise HTTPException(status_code=400, detail="Can only rate rides that are in progress or completed")
    if not booking.driver_id:
        raise HTTPException(status_code=400, detail="No driver assigned yet")

    # Check review expiry
    from app.models.setting import Setting as SettingModel
    from datetime import datetime, timezone, timedelta
    expiry_r = await db.execute(select(SettingModel).where(SettingModel.key == "review_expiry_days"))
    expiry_setting = expiry_r.scalar_one_or_none()
    expiry_days = int(expiry_setting.value) if expiry_setting else 3

    if booking.started_at:
        expiry_date = booking.started_at + timedelta(days=expiry_days)
        if datetime.now(timezone.utc) > expiry_date:
            raise HTTPException(status_code=400, detail=f"Review period has expired ({expiry_days} days after ride)")

    # Check if already rated
    existing = await db.execute(select(Rating).where(Rating.booking_id == booking.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already rated this ride")

    rating = Rating(
        booking_id=booking.id,
        driver_id=booking.driver_id,
        rating=max(1, min(5, req.rating)),
        comment=req.comment or None,
    )
    db.add(rating)

    # Update driver average rating
    driver = await db.execute(select(Driver).where(Driver.id == booking.driver_id))
    driver_obj = driver.scalar_one_or_none()
    if driver_obj:
        avg_r = await db.execute(
            select(func.avg(Rating.rating))
            .join(Booking, Rating.booking_id == Booking.id)
            .where(Booking.driver_id == driver_obj.id)
        )
        new_avg = avg_r.scalar()
        if new_avg:
            driver_obj.rating_avg = round(float(new_avg), 2)

    await db.commit()
    return {"message": "Thank you for your rating!"}
