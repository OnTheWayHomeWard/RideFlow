from pydantic import BaseModel
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
    if cashier.hotel_id:
        hotel_r = await db.execute(select(Hotel).where(Hotel.id == cashier.hotel_id))
        hotel = hotel_r.scalar_one_or_none()
        if hotel:
            hotel_name = hotel.name
            hotel_commission = float(hotel.default_commission_pct)

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
