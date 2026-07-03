from datetime import date, time, timedelta, datetime, timezone
from typing import Optional
from pydantic import BaseModel, EmailStr, model_validator
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cashier import Cashier
from app.models.hotel import Hotel
from app.models.booking import Booking
from app.models.payment_split import PaymentSplit
from app.middleware.auth import get_current_cashier
from app.utils.security import hash_password, verify_password
from app.schemas.cashier import CashierValidateOut
from app.services.pricing_service import calculate_price

router = APIRouter(prefix="/api", tags=["cashiers"])


@router.get("/cashiers/{ref_code}/validate", response_model=CashierValidateOut)
async def validate_cashier(ref_code: str, db: AsyncSession = Depends(get_db)):
    """Validate a cashier ref code (from QR scan)."""
    result = await db.execute(
        select(Cashier).where(Cashier.ref_code == ref_code, Cashier.status == "active")
    )
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Invalid or inactive cashier code")

    hotel_name = hotel_address = None
    hotel_lat = hotel_lng = None
    if cashier.hotel_id:
        hotel_result = await db.execute(select(Hotel).where(Hotel.id == cashier.hotel_id))
        hotel = hotel_result.scalar_one_or_none()
        if hotel:
            hotel_name = hotel.name
            hotel_address = hotel.address
            hotel_lat = float(hotel.lat) if hotel.lat else None
            hotel_lng = float(hotel.lng) if hotel.lng else None

    return CashierValidateOut(
        cashier_id=cashier.id, cashier_name=cashier.name, ref_code=cashier.ref_code,
        hotel_id=cashier.hotel_id, hotel_name=hotel_name, hotel_address=hotel_address,
        hotel_lat=hotel_lat, hotel_lng=hotel_lng,
    )


# ═══════════════════════════════════════════
# CASHIER PORTAL (authenticated)
# ═══════════════════════════════════════════

@router.get("/cashiers/me")
async def get_my_profile(cashier: Cashier = Depends(get_current_cashier), db: AsyncSession = Depends(get_db)):
    """Cashier views their own profile — read only."""
    hotel_name = ""
    hotel_commission = None
    hotel_info = None
    if cashier.hotel_id:
        hotel_r = await db.execute(select(Hotel).where(Hotel.id == cashier.hotel_id))
        hotel = hotel_r.scalar_one_or_none()
        if hotel:
            hotel_name = hotel.name
            hotel_commission = float(hotel.default_commission_pct)
            # Full hotel snapshot lets the Book-for-Guest screen sort popular
            # routes by proximity to the actual pickup (this hotel) without a
            # second round-trip.
            hotel_info = {
                "id": str(hotel.id),
                "name": hotel.name,
                "address": hotel.address,
                "lat": float(hotel.lat) if hotel.lat else None,
                "lng": float(hotel.lng) if hotel.lng else None,
            }

    # Calculate effective commission: cashier override > hotel default > global default
    from app.models.setting import Setting as SettingModel
    global_r = await db.execute(select(SettingModel).where(SettingModel.key == "default_cashier_commission_pct"))
    global_setting = global_r.scalar_one_or_none()
    global_pct = float(global_setting.value) if global_setting else 10

    effective_commission = float(cashier.commission_pct) if cashier.commission_pct else (hotel_commission or global_pct)

    return {
        "id": str(cashier.id),
        "name": cashier.name,
        "phone": cashier.phone,
        "email": cashier.email,
        "ref_code": cashier.ref_code,
        "hotel_name": hotel_name,
        "hotel": hotel_info,
        "commission_pct": effective_commission,
        "total_referrals": cashier.total_referrals,
        "total_earnings": float(cashier.total_earnings),
        "status": cashier.status,
        "password_changed": cashier.password_changed,
        "payout_method": cashier.payout_method,
        "payout_details": cashier.payout_details,
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/cashiers/change-password")
async def change_password(req: ChangePasswordRequest, cashier: Cashier = Depends(get_current_cashier), db: AsyncSession = Depends(get_db)):
    """Cashier changes their password."""
    if not verify_password(req.current_password, cashier.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")

    cashier.password_hash = hash_password(req.new_password)
    cashier.password_changed = True
    await db.commit()
    return {"message": "Password changed successfully"}


@router.get("/cashiers/referrals")
async def get_my_referrals(cashier: Cashier = Depends(get_current_cashier), db: AsyncSession = Depends(get_db)):
    """Cashier views their referral bookings — only paid+ (not pending)."""
    result = await db.execute(
        select(Booking).where(
            Booking.cashier_id == cashier.id,
            Booking.status.notin_(["pending"]),  # only show after payment confirmed
        ).order_by(Booking.paid_at.desc()).limit(50)
    )
    referrals = []
    for b in result.scalars().all():
        split_r = await db.execute(
            select(PaymentSplit).where(PaymentSplit.booking_id == b.id, PaymentSplit.recipient_type == "cashier")
        )
        split = split_r.scalar_one_or_none()
        referrals.append({
            "booking_number": b.booking_number,
            "client_name": b.client_name,
            "pickup_name": b.pickup_name,
            "dropoff_name": b.dropoff_name,
            "pickup_date": str(b.pickup_date),
            "paid_at": b.paid_at.isoformat() if b.paid_at else str(b.created_at),
            "status": b.status,
            "commission": float(split.amount) if split else 0,
            "payout_status": split.payout_status if split else "pending",
            "settled_at": split.paid_at.isoformat() if split and split.paid_at else None,
        })
    return referrals


@router.get("/cashiers/earnings")
async def get_my_earnings(cashier: Cashier = Depends(get_current_cashier), db: AsyncSession = Depends(get_db)):
    """Cashier views earnings summary — all calculated live from splits, not cached."""
    from datetime import date, timedelta, datetime, timezone
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    async def sum_for_period(start_date):
        start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
        r = await db.execute(
            select(func.coalesce(func.sum(PaymentSplit.amount), 0), func.count(PaymentSplit.id))
            .join(Booking, PaymentSplit.booking_id == Booking.id)
            .where(
                PaymentSplit.recipient_id == cashier.id,
                PaymentSplit.recipient_type == "cashier",
                Booking.paid_at >= start_dt,  # use paid_at, not pickup_date
            )
        )
        return r.one()

    today_amt, today_cnt = await sum_for_period(today)
    week_amt, week_cnt = await sum_for_period(week_start)
    month_amt, month_cnt = await sum_for_period(month_start)

    # Total — calculated live from all splits, not from cached field
    total_r = await db.execute(
        select(func.coalesce(func.sum(PaymentSplit.amount), 0), func.count(PaymentSplit.id))
        .where(PaymentSplit.recipient_id == cashier.id, PaymentSplit.recipient_type == "cashier")
    )
    total_amt, total_cnt = total_r.one()

    return {
        "today": {"amount": float(today_amt), "referrals": today_cnt},
        "this_week": {"amount": float(week_amt), "referrals": week_cnt},
        "this_month": {"amount": float(month_amt), "referrals": month_cnt},
        "total": {"amount": float(total_amt), "referrals": total_cnt},
    }


# ═══════════════════════════════════════════
# GUEST RESERVATION
# ═══════════════════════════════════════════

class GuestBookingRequest(BaseModel):
    client_name: str
    # Phone OR email — same rule as the client-side BookingCreateRequest. The
    # cashier can now book an email-only guest (previously the endpoint crashed
    # on notify_guest_payment_link when phone was None).
    client_phone: Optional[str] = None
    client_email: Optional[EmailStr] = None
    client_room: Optional[str] = None

    @model_validator(mode="after")
    def _phone_or_email_required(self):
        phone = (self.client_phone or "").strip()
        email = (self.client_email or "").strip() if self.client_email else ""
        if not phone and not email:
            raise ValueError("Either a phone number or an email is required to book for a guest.")
        return self

    pickup_name: Optional[str] = None
    pickup_address: Optional[str] = None
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    dropoff_name: str
    dropoff_address: str
    dropoff_lat: float
    dropoff_lng: float
    vehicle_type: str
    pickup_date: date
    pickup_time: time
    extras: Optional[list] = None


@router.post("/cashiers/book-for-guest")
async def book_for_guest(
    req: GuestBookingRequest,
    cashier: Cashier = Depends(get_current_cashier),
    db: AsyncSession = Depends(get_db),
):
    """Cashier creates a booking on behalf of a guest. Payment link sent to guest phone."""
    # Get cashier's hotel for pickup
    if not cashier.hotel_id:
        raise HTTPException(status_code=400, detail="You are not assigned to a hotel")

    hotel_r = await db.execute(select(Hotel).where(Hotel.id == cashier.hotel_id))
    hotel = hotel_r.scalar_one_or_none()
    if not hotel:
        raise HTTPException(status_code=400, detail="Hotel not found")
    # Use custom pickup if provided, otherwise hotel
    if req.pickup_lat and req.pickup_lng and req.pickup_name:
        p_name, p_address = req.pickup_name, req.pickup_address or req.pickup_name
        p_lat, p_lng = req.pickup_lat, req.pickup_lng
    else:
        if not hotel.lat or not hotel.lng:
            raise HTTPException(status_code=400, detail="Your hotel does not have coordinates set. Ask admin to update the hotel location.")
        p_name, p_address = hotel.name, hotel.address
        p_lat, p_lng = float(hotel.lat), float(hotel.lng)

    # Calculate price (pass pickup_dt so time-of-day upsales evaluate correctly)
    from datetime import datetime as _dt, timezone as _tz
    pickup_dt = _dt.combine(req.pickup_date, req.pickup_time, tzinfo=_tz.utc)

    # Merge any forced extras from matching pickup-group (defense in depth).
    # merge_forced_extras returns (extras, group_names, surcharge) — unpacking
    # only two was the source of "too many values to unpack" 500s any time
    # the pickup matched a group (e.g. Waldorf Astoria on the Disney list).
    from app.services.pickup_group_service import merge_forced_extras
    final_extras, _matched, _surcharge = await merge_forced_extras(db, p_lat, p_lng, req.extras)

    try:
        price = await calculate_price(
            db, p_lat, p_lng,
            req.dropoff_lat, req.dropoff_lng,
            req.vehicle_type, final_extras, pickup_dt=pickup_dt,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Generate booking number
    from app.routers.bookings import generate_booking_number
    booking_number = generate_booking_number()
    while True:
        existing = await db.execute(select(Booking.id).where(Booking.booking_number == booking_number))
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
        pickup_name=p_name,
        pickup_address=p_address,
        pickup_lat=p_lat,
        pickup_lng=p_lng,
        dropoff_name=req.dropoff_name,
        dropoff_address=req.dropoff_address,
        dropoff_lat=req.dropoff_lat,
        dropoff_lng=req.dropoff_lng,
        distance_miles=price["distance_miles"],
        pickup_date=req.pickup_date,
        pickup_time=req.pickup_time,
        passengers=1,
        luggage="none",
        vehicle_type=req.vehicle_type,
        base_amount=price["base_amount"],
        extras_amount=price["extras_amount"],
        upsale_amount=price["upsale_amount"],
        total_amount=price["total_amount"],
        common_route_id=price["common_route_id"],
        upsale_id=price["upsale_id"],
        extras_chosen=final_extras if final_extras else None,
        cashier_id=cashier.id,
        hotel_id=cashier.hotel_id,
        status="pending",
    )
    db.add(booking)
    await db.flush()

    # Create checkout session
    from app.services.payment_service import create_checkout_session
    checkout = await create_checkout_session(db, booking)

    # Commit the booking FIRST — before any notification. SMS/email helpers
    # do their own db writes (notification_log), and a Twilio/Resend failure
    # can leave the session in a rolled-back state that would break a
    # trailing db.commit(). Ordering the commit up front means the booking
    # is durable even if every notification channel fails.
    await db.commit()
    await db.refresh(booking)

    payment_url = checkout.get("checkout_url") or checkout.get("dev_confirm_url", "")
    template_vars = {
        "client_name": req.client_name,
        "hotel_name": hotel.name,
        "pickup_name": p_name,
        "dropoff_name": req.dropoff_name,
        "pickup_date": str(req.pickup_date),
        "pickup_time": str(req.pickup_time)[:5],
        "total_amount": f"{float(price['total_amount']):.2f}",
        "payment_url": payment_url,
        "booking_number": booking_number,
    }
    channels_sent = []
    if req.client_phone:
        try:
            from app.services.sms_service import notify_guest_payment_link
            await notify_guest_payment_link(db, req.client_phone, template_vars)
            channels_sent.append("sms")
        except Exception as e:
            # Session may be in a bad state after a mid-flight failure — reset
            # so the next channel (email) can still write its own log row.
            try: await db.rollback()
            except Exception: pass
            import logging; logging.getLogger("cashier").exception(f"guest SMS failed: {e}")
    if req.client_email:
        try:
            from app.services.email_service import notify_guest_payment_link_email
            res = await notify_guest_payment_link_email(db, req.client_email, template_vars, booking)
            if res.get("sent"):
                channels_sent.append("email")
        except Exception as e:
            try: await db.rollback()
            except Exception: pass
            import logging; logging.getLogger("cashier").exception(f"guest email failed: {e}")

    return {
        "booking_number": booking_number,
        "total_amount": float(price["total_amount"]),
        "payment_url": payment_url,
        "client_phone": req.client_phone,
        "client_email": req.client_email,
        "channels_sent": channels_sent,
    }


@router.get("/cashiers/reservations")
async def get_my_reservations(cashier: Cashier = Depends(get_current_cashier), db: AsyncSession = Depends(get_db)):
    """Cashier views all bookings they created (including pending ones)."""
    result = await db.execute(
        select(Booking).where(Booking.cashier_id == cashier.id)
        .order_by(Booking.created_at.desc()).limit(50)
    )
    reservations = []
    for b in result.scalars().all():
        split_r = await db.execute(
            select(PaymentSplit).where(PaymentSplit.booking_id == b.id, PaymentSplit.recipient_type == "cashier")
        )
        split = split_r.scalar_one_or_none()
        reservations.append({
            "id": str(b.id),
            "booking_number": b.booking_number,
            "client_name": b.client_name,
            "client_phone": b.client_phone,
            "pickup_name": b.pickup_name,
            "dropoff_name": b.dropoff_name,
            "pickup_date": str(b.pickup_date),
            "pickup_time": str(b.pickup_time),
            "total_amount": float(b.total_amount),
            "status": b.status,
            "commission": float(split.amount) if split else 0,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        })
    return reservations


# ═══════════════════════════════════════════
# STRIPE CONNECT
# ═══════════════════════════════════════════

@router.post("/cashiers/stripe/connect")
async def stripe_connect(cashier: Cashier = Depends(get_current_cashier), db: AsyncSession = Depends(get_db)):
    from app.services.connect_service import create_connect_account, create_onboarding_link, get_account_details

    if not cashier.stripe_connect_id:
        acct_id = await create_connect_account("cashier", cashier.id, cashier.email)
        cashier.stripe_connect_id = acct_id
        cashier.payout_method = "stripe_connect"
        await db.flush()
    else:
        acct_id = cashier.stripe_connect_id

    details = await get_account_details(acct_id)
    if details.get("charges_enabled") and details.get("payouts_enabled"):
        cashier.payout_details = details
        await db.commit()
        return {"already_connected": True, "account_id": acct_id, "details": details}

    from app.utils.urls import get_staff_base_url
    staff_base = await get_staff_base_url(db)
    url = await create_onboarding_link(acct_id, f"{staff_base}/cashier/profile?stripe=complete", f"{staff_base}/cashier/profile?stripe=refresh")
    await db.commit()
    return {"onboarding_url": url, "account_id": acct_id}


@router.get("/cashiers/stripe/status")
async def stripe_status(cashier: Cashier = Depends(get_current_cashier), db: AsyncSession = Depends(get_db)):
    if not cashier.stripe_connect_id:
        return {"connected": False}

    from app.services.connect_service import get_account_details
    details = await get_account_details(cashier.stripe_connect_id)
    cashier.payout_details = details
    await db.commit()

    return {
        "connected": True,
        "charges_enabled": details.get("charges_enabled", False),
        "payouts_enabled": details.get("payouts_enabled", False),
        "details_submitted": details.get("details_submitted", False),
        "account_id": cashier.stripe_connect_id,
        "name": details.get("name"),
        "email": details.get("email"),
        "bank_last4": details.get("bank_last4"),
        "bank_name": details.get("bank_name"),
    }


@router.post("/cashiers/stripe/onboarding-link")
async def stripe_onboarding_link(cashier: Cashier = Depends(get_current_cashier), db: AsyncSession = Depends(get_db)):
    if not cashier.stripe_connect_id:
        raise HTTPException(status_code=400, detail="No Stripe account found. Use /stripe/connect first.")

    from app.services.connect_service import create_onboarding_link
    from app.utils.urls import get_staff_base_url
    staff_base = await get_staff_base_url(db)
    url = await create_onboarding_link(cashier.stripe_connect_id, f"{staff_base}/cashier/profile?stripe=complete", f"{staff_base}/cashier/profile?stripe=refresh")
    return {"onboarding_url": url}
