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

    # Validate against configured service areas (countries + cities)
    from app.services.service_area_service import get_service_areas, location_in_service_areas
    areas = await get_service_areas(db)
    if not location_in_service_areas(req.pickup_lat, req.pickup_lng, req.pickup_country, areas):
        raise HTTPException(status_code=400, detail="Pickup location is outside our service area")
    if not location_in_service_areas(req.dropoff_lat, req.dropoff_lng, req.dropoff_country, areas):
        raise HTTPException(status_code=400, detail="Destination is outside our service area")

    # Enforce minimum advance booking time
    from app.models.setting import Setting as SettingModel
    from datetime import datetime, timedelta, timezone
    min_r = await db.execute(select(SettingModel).where(SettingModel.key == "min_advance_booking_hours"))
    min_setting = min_r.scalar_one_or_none()
    min_hours = float(min_setting.value) if min_setting else 0.5

    # pickup_date/pickup_time arrive in the rider's local timezone. Convert to
    # UTC using the offset they sent (JS getTimezoneOffset semantics: minutes
    # local lags UTC, e.g. EDT=+240). Then store the UTC date/time so the rest
    # of the code (reminder scheduler, upsale time-of-day, etc.) — which all
    # assume the stored values are UTC — keeps working.
    local_naive = datetime.combine(req.pickup_date, req.pickup_time)
    pickup_dt = (local_naive + timedelta(minutes=req.pickup_tz_offset_minutes)).replace(tzinfo=timezone.utc)
    pickup_date_utc = pickup_dt.date()
    pickup_time_utc = pickup_dt.time()
    earliest = datetime.now(timezone.utc) + timedelta(hours=min_hours)
    if pickup_dt < earliest:
        if min_hours < 1:
            mins = int(min_hours * 60)
            msg = f"Pickup must be at least {mins} minutes from now"
        else:
            msg = f"Pickup must be at least {min_hours} hours from now"
        raise HTTPException(status_code=400, detail=msg)

    # Validate cross-country booking
    if req.pickup_country and req.dropoff_country:
        from app.models.setting import Setting as SettingModel
        cross_r = await db.execute(select(SettingModel).where(SettingModel.key == "allow_cross_country_booking"))
        cross_setting = cross_r.scalar_one_or_none()
        allow_cross = str(cross_setting.value).lower() == "true" if cross_setting else False
        if not allow_cross and req.pickup_country.upper() != req.dropoff_country.upper():
            raise HTTPException(
                status_code=400,
                detail=f"Cross-country bookings are not allowed. Pickup ({req.pickup_country}) and destination ({req.dropoff_country}) must be in the same country."
            )

    # If pickup falls inside a pickup-group, merge in any forced extras the
    # group requires (defense-in-depth — even a bad client can't bypass).
    # Same for dropoff-groups against the dropoff coords.
    from app.services.pickup_group_service import merge_forced_extras as _merge_pickup_extras
    from app.services.dropoff_group_service import merge_forced_extras as _merge_dropoff_extras
    extras_after_pickup, _pickup_group_names, _ = await _merge_pickup_extras(db, req.pickup_lat, req.pickup_lng, req.extras)
    final_extras, _dropoff_group_names, _ = await _merge_dropoff_extras(db, req.dropoff_lat, req.dropoff_lng, extras_after_pickup)

    # Calculate price (pass pickup_dt so time-of-day upsales evaluate correctly)
    try:
        price = await calculate_price(
            db, req.pickup_lat, req.pickup_lng,
            req.dropoff_lat, req.dropoff_lng,
            req.vehicle_type, final_extras, pickup_dt=pickup_dt,
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
        pickup_date=pickup_date_utc,
        pickup_time=pickup_time_utc,
        sms_consent=req.sms_consent,
        passengers=req.passengers,
        luggage=req.luggage,
        vehicle_type=req.vehicle_type,
        base_amount=price["base_amount"],
        extras_amount=price["extras_amount"],
        upsale_amount=price["upsale_amount"],
        pickup_surcharge=price.get("pickup_surcharge", 0),
        dropoff_surcharge=price.get("dropoff_surcharge", 0),
        total_amount=price["total_amount"],
        common_route_id=price["common_route_id"],
        upsale_id=price["upsale_id"],
        extras_chosen=final_extras if final_extras else None,
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
