from datetime import timezone
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.cashier import Cashier
from app.models.driver import Driver
from app.models.rating import Rating
from app.models.setting import Setting
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
    from datetime import datetime, timedelta
    from app.utils.timezone import get_business_tz
    min_r = await db.execute(select(SettingModel).where(SettingModel.key == "min_advance_booking_hours"))
    min_setting = min_r.scalar_one_or_none()
    min_hours = float(min_setting.value) if min_setting else 0.5

    # We operate on a single business timezone (default America/New_York).
    # The rider's pickup_date / pickup_time are stored AS-IS — exactly the
    # wall-clock time they chose. For comparisons (min-advance, reminders,
    # upsale time-of-day), tag the naive value with the business timezone.
    biz_tz = await get_business_tz(db)
    pickup_dt = datetime.combine(req.pickup_date, req.pickup_time, tzinfo=biz_tz)
    pickup_date_stored = req.pickup_date
    pickup_time_stored = req.pickup_time
    earliest = datetime.now(biz_tz) + timedelta(hours=min_hours)
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
        client_phone=(req.client_phone or None),
        client_email=(req.client_email or None),
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
        pickup_date=pickup_date_stored,
        pickup_time=pickup_time_stored,
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


# ─── Rider self-cancel from the receipt page ────────────────────────────

@router.post("/bookings/{booking_number}/cancel")
async def cancel_booking(booking_number: str, db: AsyncSession = Depends(get_db)):
    """Rider cancels their own booking from the confirmation page.

    Allowed only when the pickup is at least `cancellation_window_hours`
    away (default 24h). When allowed, issues a FULL Stripe refund of the
    most recent successful payment, flips the booking to `cancelled`,
    notifies the rider (SMS + email), and pings every admin via the in-app
    inbox. Outside the window, returns 400 — admin must handle manually.
    """
    from datetime import datetime, timedelta
    from app.utils.timezone import get_business_tz
    from app.models.payment import Payment

    r = await db.execute(select(Booking).where(Booking.booking_number == booking_number))
    booking = r.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status in ("cancelled", "refunded"):
        raise HTTPException(status_code=400, detail="This booking is already cancelled.")
    if booking.status not in ("paid", "assigned"):
        raise HTTPException(
            status_code=400,
            detail=f"This booking cannot be cancelled (status: {booking.status}). Contact support if you need help.",
        )

    biz_tz = await get_business_tz(db)
    pickup_dt = datetime.combine(booking.pickup_date, booking.pickup_time, tzinfo=biz_tz)

    win_r = await db.execute(select(Setting).where(Setting.key == "cancellation_window_hours"))
    win_s = win_r.scalar_one_or_none()
    try:
        window_hours = float(win_s.value) if win_s and win_s.value not in (None, "") else 24.0
    except (TypeError, ValueError):
        window_hours = 24.0

    cutoff = datetime.now(biz_tz) + timedelta(hours=window_hours)
    if pickup_dt < cutoff:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Free cancellation closes {int(window_hours)}h before pickup. "
                f"Please contact support — an admin can still help."
            ),
        )

    # Refund-percent setting — 100 by default, clamp to [0, 100] so a misconfigured
    # value can't accidentally refund more than the rider paid (or send Stripe a negative amount).
    pct_r = await db.execute(select(Setting).where(Setting.key == "cancellation_refund_percent"))
    pct_s = pct_r.scalar_one_or_none()
    try:
        refund_percent = float(pct_s.value) if pct_s and pct_s.value not in (None, "") else 100.0
    except (TypeError, ValueError):
        refund_percent = 100.0
    refund_percent = max(0.0, min(100.0, refund_percent))

    # Find the latest successful payment to refund
    p_r = await db.execute(
        select(Payment)
        .where(Payment.booking_id == booking.id, Payment.status == "succeeded")
        .order_by(Payment.created_at.desc())
    )
    payment = p_r.scalars().first()

    paid_amount = float(payment.amount) if payment else 0.0
    # Round to cents so we never send Stripe a fractional-cent amount.
    refund_amount = round(paid_amount * refund_percent / 100.0, 2)
    refund_currency = (payment.currency if payment else "USD").lower()
    stripe_refund_id = None

    if payment and payment.stripe_payment_id and refund_amount > 0:
        try:
            import stripe, os
            stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
            if stripe.api_key and not stripe.api_key.startswith("placeholder"):
                # Refund by payment_intent. Omit `amount` for a full refund — Stripe handles
                # rounding edge-cases better than we can; pass cents only for partials.
                if refund_percent >= 100.0:
                    refund = stripe.Refund.create(payment_intent=payment.stripe_payment_id)
                else:
                    refund = stripe.Refund.create(
                        payment_intent=payment.stripe_payment_id,
                        amount=int(round(refund_amount * 100)),
                    )
                stripe_refund_id = refund.id
            else:
                # Dev mode — no real Stripe call; we still mark refunded so downstream UX is consistent.
                stripe_refund_id = f"dev_refund_{booking.booking_number}"
        except Exception as e:
            # Surface stripe failures to the rider so they retry rather than silently failing.
            raise HTTPException(status_code=502, detail=f"Refund failed at the payment processor: {e}. Please try again or contact support.")

        payment.refund_amount = refund_amount
        payment.refund_reason = (
            "Rider self-cancelled within free-cancellation window"
            if refund_percent >= 100.0
            else f"Rider self-cancelled — {refund_percent:g}% refund per settings"
        )
        payment.stripe_refund_id = stripe_refund_id
        payment.refunded_at = datetime.now(timezone.utc)
        # Stripe treats a partial refund as `partially_refunded` once the PI status updates,
        # but our internal Payment model only tracks the final state — mark fully when 100%,
        # otherwise reflect the partial.
        payment.status = "refunded" if refund_percent >= 100.0 else "partially_refunded"

    # Flip booking
    booking.status = "cancelled"
    booking.cancelled_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(booking)

    # Best-effort notifications — never block the cancel
    try:
        from app.utils.urls import get_client_base_url
        confirmation_url = f"{await get_client_base_url(db)}/confirmation/{booking.booking_number}"
        # SMS — only fires if the rider consented; uses notify_client_refund helper (already gated)
        from app.services.sms_service import notify_client_refund
        await notify_client_refund(db, booking, {
            "client_name": booking.client_name,
            "amount": f"{refund_amount:.2f}",
            "booking_number": booking.booking_number,
            "confirmation_url": confirmation_url,
        })
    except Exception as e:
        import logging; logging.getLogger("cancel").exception(f"SMS notify failed: {e}")

    try:
        from app.services.email_service import notify_client_cancellation_email
        await notify_client_cancellation_email(db, booking, refund_amount, refund_currency)
    except Exception as e:
        import logging; logging.getLogger("cancel").exception(f"email notify failed: {e}")

    try:
        from app.services.notifications_service import notify_all_admins
        await notify_all_admins(
            db,
            kind="booking_cancelled",
            title=f"Booking {booking.booking_number} cancelled by rider",
            body=f"{booking.client_name} cancelled — refund ${refund_amount:.2f} {refund_currency.upper()} issued.",
            link=f"/admin/runs/{booking.id}",
            related_type="booking",
            related_id=booking.id,
        )
    except Exception as e:
        import logging; logging.getLogger("cancel").exception(f"admin notify failed: {e}")

    # If a driver had already accepted this run, they need to know it's gone
    # from their schedule — SMS to grab their attention + in-app inbox row.
    # We also void any pending driver PaymentSplit so the cancelled ride
    # doesn't keep showing up as a future payout for them.
    if booking.driver_id:
        from app.models.payment_split import PaymentSplit
        driver_r = await db.execute(select(Driver).where(Driver.id == booking.driver_id))
        driver = driver_r.scalar_one_or_none()

        # Void the driver split — no earnings on a rider-cancelled ride.
        try:
            ps_r = await db.execute(
                select(PaymentSplit).where(
                    PaymentSplit.booking_id == booking.id,
                    PaymentSplit.recipient_type == "driver",
                    PaymentSplit.payout_status.in_(("pending", "pending_review")),
                )
            )
            for split in ps_r.scalars().all():
                split.payout_status = "cancelled"
            await db.commit()
        except Exception as e:
            import logging; logging.getLogger("cancel").exception(f"voiding driver split failed: {e}")

        if driver:
            # SMS — different template from the admin-reassignment one so the
            # wording is honest ("cancelled by the rider", not "reassigned").
            try:
                from app.services.sms_service import notify_driver_run_cancelled_by_rider
                await notify_driver_run_cancelled_by_rider(db, driver.phone, {
                    "driver_name": driver.name,
                    "pickup_name": booking.pickup_name,
                    "dropoff_name": booking.dropoff_name,
                    "pickup_date": str(booking.pickup_date),
                    "pickup_time": str(booking.pickup_time)[:5],
                    "booking_number": booking.booking_number,
                })
            except Exception as e:
                import logging; logging.getLogger("cancel").exception(f"driver SMS notify failed: {e}")

            # In-app inbox + FCM push to the driver
            try:
                from app.services.notifications_service import notify
                await notify(
                    db,
                    recipient_type="driver",
                    recipient_id=driver.id,
                    kind="run_cancelled_by_rider",
                    title=f"Run cancelled — {booking.booking_number}",
                    body=f"The rider cancelled {booking.pickup_name} → {booking.dropoff_name} ({booking.pickup_date} {str(booking.pickup_time)[:5]}). It's been removed from your schedule.",
                    link=f"/driver/run-detail/{booking.id}",
                    related_type="booking",
                    related_id=booking.id,
                )
            except Exception as e:
                import logging; logging.getLogger("cancel").exception(f"driver in-app notify failed: {e}")

    return {
        "ok": True,
        "booking_number": booking.booking_number,
        "status": "cancelled",
        "refund_amount": refund_amount,
        "refund_currency": refund_currency,
        "refund_percent": refund_percent,
        "stripe_refund_id": stripe_refund_id,
    }


@router.get("/bookings/{booking_number}/cancellation-eligibility")
async def cancellation_eligibility(booking_number: str, db: AsyncSession = Depends(get_db)):
    """Lightweight check used by the receipt page to decide whether to show
    the Cancel button. No mutations, no auth."""
    from datetime import datetime, timedelta
    from app.utils.timezone import get_business_tz

    r = await db.execute(select(Booking).where(Booking.booking_number == booking_number))
    booking = r.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    win_r = await db.execute(select(Setting).where(Setting.key == "cancellation_window_hours"))
    win_s = win_r.scalar_one_or_none()
    try:
        window_hours = float(win_s.value) if win_s and win_s.value not in (None, "") else 24.0
    except (TypeError, ValueError):
        window_hours = 24.0

    pct_r = await db.execute(select(Setting).where(Setting.key == "cancellation_refund_percent"))
    pct_s = pct_r.scalar_one_or_none()
    try:
        refund_percent = float(pct_s.value) if pct_s and pct_s.value not in (None, "") else 100.0
    except (TypeError, ValueError):
        refund_percent = 100.0
    refund_percent = max(0.0, min(100.0, refund_percent))

    biz_tz = await get_business_tz(db)
    pickup_dt = datetime.combine(booking.pickup_date, booking.pickup_time, tzinfo=biz_tz)
    cutoff = datetime.now(biz_tz) + timedelta(hours=window_hours)

    cancellable = (
        booking.status in ("paid", "assigned")
        and pickup_dt >= cutoff
    )

    # Estimated refund so the receipt page can show "You'll be refunded $X" before confirming.
    estimated_refund = round(float(booking.total_amount) * refund_percent / 100.0, 2)

    return {
        "cancellable": cancellable,
        "status": booking.status,
        "window_hours": window_hours,
        "refund_percent": refund_percent,
        "estimated_refund": estimated_refund,
        "pickup_at": pickup_dt.isoformat(),
        "free_cancel_until": (pickup_dt - timedelta(hours=window_hours)).isoformat(),
    }
