from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.admin import Admin
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.cashier import Cashier
from app.models.hotel import Hotel
from app.models.payment import Payment
from app.models.payment_split import PaymentSplit
from app.models.upsale import Upsale
from app.models.common_route import CommonRoute
from app.models.vehicle_rate import VehicleRate
from app.models.extra import Extra
from app.models.setting import Setting
from app.utils.helpers import generate_ref_code
from app.utils.security import hash_password
from app.schemas.admin import (
    DashboardStats, PayoutRequestOut, PayoutActionRequest,
    AdminDriverOut, DriverUpdateRequest, ApproveRejectRequest,
    HotelCreateRequest, HotelOut,
    AdminCashierOut,
    UpsaleCreateRequest, UpsaleOut,
    RouteCreateRequest,
    SettingOut, SettingUpdateRequest,
    AdminBookingOut,
)
from app.schemas.pricing import VehicleRateOut, CommonRouteOut, ExtraOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ═══════════════════════════════════════════
# DASHBOARD
# ═══════════════════════════════════════════

@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    async def rides_and_revenue(start):
        r = await db.execute(
            select(func.count(Booking.id), func.coalesce(func.sum(Booking.total_amount), 0))
            .where(Booking.status == "completed", Booking.pickup_date >= start)
        )
        return r.one()

    today_rides, today_revenue = await rides_and_revenue(today)
    week_rides, week_revenue = await rides_and_revenue(week_start)
    month_rides, month_revenue = await rides_and_revenue(month_start)

    # Company revenue today
    r = await db.execute(
        select(func.coalesce(func.sum(PaymentSplit.amount), 0))
        .join(Booking, PaymentSplit.booking_id == Booking.id)
        .where(PaymentSplit.recipient_type == "company", Booking.pickup_date >= today)
    )
    today_company = float(r.scalar())

    # Pending counts
    r = await db.execute(select(func.count()).where(PaymentSplit.payout_status == "pending_review"))
    pending_payouts = r.scalar()

    r = await db.execute(select(func.count()).where(Driver.status == "pending"))
    pending_drivers = r.scalar()

    r = await db.execute(select(func.count()).where(Cashier.status == "pending"))
    pending_cashiers = r.scalar()

    r = await db.execute(select(func.count()).where(Driver.status == "active"))
    active_drivers = r.scalar()

    r = await db.execute(select(func.count(Driver.id)))
    total_drivers = r.scalar()

    return DashboardStats(
        today_rides=today_rides, today_revenue=float(today_revenue), today_company=today_company,
        week_rides=week_rides, week_revenue=float(week_revenue),
        month_rides=month_rides, month_revenue=float(month_revenue),
        pending_payouts=pending_payouts,
        pending_driver_approvals=pending_drivers,
        pending_cashier_approvals=pending_cashiers,
        active_drivers=active_drivers, total_drivers=total_drivers,
    )


# ═══════════════════════════════════════════
# PAYOUT REQUESTS
# ═══════════════════════════════════════════

@router.get("/payouts", response_model=list[PayoutRequestOut])
async def list_payouts(
    status: str = Query("pending_review"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List payout requests. Filter by status: pending_review, released, flagged, rejected."""
    result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.recipient_type == "driver",
            PaymentSplit.payout_status == status,
        ).order_by(PaymentSplit.created_at.desc())
    )
    splits = result.scalars().all()

    payouts = []
    for s in splits:
        # Get booking
        b_result = await db.execute(select(Booking).where(Booking.id == s.booking_id))
        b = b_result.scalar_one_or_none()
        if not b:
            continue

        # Get driver
        d_result = await db.execute(select(Driver).where(Driver.id == s.recipient_id))
        d = d_result.scalar_one_or_none()

        # Get cashier split amount
        c_result = await db.execute(
            select(PaymentSplit).where(
                PaymentSplit.booking_id == s.booking_id,
                PaymentSplit.recipient_type == "cashier",
            )
        )
        cashier_split = c_result.scalar_one_or_none()

        # Get company split
        co_result = await db.execute(
            select(PaymentSplit).where(
                PaymentSplit.booking_id == s.booking_id,
                PaymentSplit.recipient_type == "company",
            )
        )
        company_split = co_result.scalar_one_or_none()

        payouts.append(PayoutRequestOut(
            split_id=s.id,
            booking_number=b.booking_number,
            booking_id=b.id,
            pickup_name=b.pickup_name,
            dropoff_name=b.dropoff_name,
            pickup_date=b.pickup_date,
            pickup_time=b.pickup_time,
            completed_at=b.completed_at,
            driver_name=d.name if d else "Unknown",
            driver_phone=d.phone if d else "",
            driver_id=s.recipient_id,
            client_name=b.client_name,
            client_phone=b.client_phone,
            vehicle_type=b.vehicle_type,
            total_fare=float(b.total_amount),
            driver_amount=float(s.amount),
            company_amount=float(company_split.amount) if company_split else 0,
            cashier_amount=float(cashier_split.amount) if cashier_split else 0,
            start_location=b.start_location,
            end_location=b.end_location,
            payout_status=s.payout_status,
        ))

    return payouts


@router.put("/payouts/{split_id}/release")
async def release_payout(
    split_id: str,
    req: PayoutActionRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin releases driver payout after verifying ride happened."""
    result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.id == split_id,
            PaymentSplit.recipient_type == "driver",
            PaymentSplit.payout_status == "pending_review",
        )
    )
    split = result.scalar_one_or_none()
    if not split:
        raise HTTPException(status_code=404, detail="Payout request not found or already processed")

    split.payout_status = "released"
    split.reviewed_by = admin.id
    split.reviewed_at = datetime.now(timezone.utc)
    split.review_note = req.note
    split.paid_at = datetime.now(timezone.utc)

    # Also mark company split as released
    co_result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.booking_id == split.booking_id,
            PaymentSplit.recipient_type == "company",
        )
    )
    company_split = co_result.scalar_one_or_none()
    if company_split:
        company_split.payout_status = "released"
        company_split.reviewed_at = datetime.now(timezone.utc)

    # Update driver total earnings
    if split.recipient_id:
        d_result = await db.execute(select(Driver).where(Driver.id == split.recipient_id))
        driver = d_result.scalar_one_or_none()
        if driver:
            driver.total_earnings = float(driver.total_earnings or 0) + float(split.amount)

    await db.commit()
    return {"message": "Payout released", "amount": float(split.amount)}


@router.put("/payouts/{split_id}/flag")
async def flag_payout(
    split_id: str,
    req: PayoutActionRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin flags a payout for investigation."""
    result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.id == split_id,
            PaymentSplit.recipient_type == "driver",
            PaymentSplit.payout_status == "pending_review",
        )
    )
    split = result.scalar_one_or_none()
    if not split:
        raise HTTPException(status_code=404, detail="Payout request not found")

    split.payout_status = "flagged"
    split.reviewed_by = admin.id
    split.reviewed_at = datetime.now(timezone.utc)
    split.review_note = req.note

    await db.commit()
    return {"message": "Payout flagged for investigation"}


@router.put("/payouts/{split_id}/reject")
async def reject_payout(
    split_id: str,
    req: PayoutActionRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin rejects payout — confirmed fraud or issue."""
    result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.id == split_id,
            PaymentSplit.recipient_type == "driver",
            PaymentSplit.payout_status.in_(["pending_review", "flagged"]),
        )
    )
    split = result.scalar_one_or_none()
    if not split:
        raise HTTPException(status_code=404, detail="Payout request not found")

    split.payout_status = "rejected"
    split.reviewed_by = admin.id
    split.reviewed_at = datetime.now(timezone.utc)
    split.review_note = req.note

    await db.commit()
    return {"message": "Payout rejected"}


# ═══════════════════════════════════════════
# BOOKINGS
# ═══════════════════════════════════════════

@router.get("/bookings", response_model=list[AdminBookingOut])
async def list_bookings(
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
    offset: int = 0,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Booking)
    if status:
        query = query.where(Booking.status == status)
    if date_from:
        query = query.where(Booking.pickup_date >= date_from)
    if date_to:
        query = query.where(Booking.pickup_date <= date_to)
    query = query.order_by(Booking.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    bookings = result.scalars().all()

    out = []
    for b in bookings:
        driver_name = None
        if b.driver_id:
            dr = await db.execute(select(Driver.name).where(Driver.id == b.driver_id))
            driver_name = dr.scalar_one_or_none()

        hotel_name = None
        if b.hotel_id:
            hr = await db.execute(select(Hotel.name).where(Hotel.id == b.hotel_id))
            hotel_name = hr.scalar_one_or_none()

        cashier_name = None
        if b.cashier_id:
            cr = await db.execute(select(Cashier.name).where(Cashier.id == b.cashier_id))
            cashier_name = cr.scalar_one_or_none()

        out.append(AdminBookingOut(
            id=b.id, booking_number=b.booking_number,
            client_name=b.client_name, client_phone=b.client_phone,
            pickup_name=b.pickup_name, dropoff_name=b.dropoff_name,
            pickup_date=b.pickup_date, pickup_time=b.pickup_time,
            vehicle_type=b.vehicle_type, passengers=b.passengers,
            total_amount=float(b.total_amount), status=b.status,
            driver_name=driver_name, hotel_name=hotel_name, cashier_name=cashier_name,
            created_at=b.created_at,
        ))
    return out


# ═══════════════════════════════════════════
# DRIVERS
# ═══════════════════════════════════════════

@router.get("/drivers", response_model=list[AdminDriverOut])
async def list_drivers(
    status: str | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Driver)
    if status:
        query = query.where(Driver.status == status)
    query = query.order_by(Driver.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.put("/drivers/{driver_id}/approve")
async def approve_driver(
    driver_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Driver).where(Driver.id == driver_id, Driver.status == "pending"))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found or not pending")

    driver.status = "active"
    driver.approved_at = datetime.now(timezone.utc)
    driver.approved_by = admin.id
    await db.commit()
    return {"message": f"Driver {driver.name} approved"}


@router.put("/drivers/{driver_id}/reject")
async def reject_driver(
    driver_id: str,
    req: ApproveRejectRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Driver).where(Driver.id == driver_id, Driver.status == "pending"))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found or not pending")

    driver.status = "inactive"
    driver.rejection_reason = req.reason
    await db.commit()
    return {"message": f"Driver {driver.name} rejected"}


@router.put("/drivers/{driver_id}")
async def update_driver(
    driver_id: str,
    req: DriverUpdateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    if req.pay_percentage is not None:
        driver.pay_percentage = req.pay_percentage
    if req.status is not None:
        driver.status = req.status
    if req.vehicle_type is not None:
        driver.vehicle_type = req.vehicle_type

    await db.commit()
    return {"message": f"Driver {driver.name} updated"}


# ═══════════════════════════════════════════
# HOTELS
# ═══════════════════════════════════════════

@router.get("/hotels", response_model=list[HotelOut])
async def list_hotels(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hotel).order_by(Hotel.name))
    return result.scalars().all()


@router.post("/hotels", response_model=HotelOut)
async def create_hotel(
    req: HotelCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    hotel = Hotel(**req.model_dump())
    db.add(hotel)
    await db.commit()
    await db.refresh(hotel)
    return hotel


@router.put("/hotels/{hotel_id}", response_model=HotelOut)
async def update_hotel(
    hotel_id: str, req: HotelCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Hotel).where(Hotel.id == hotel_id))
    hotel = result.scalar_one_or_none()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")

    for key, value in req.model_dump().items():
        setattr(hotel, key, value)
    await db.commit()
    await db.refresh(hotel)
    return hotel


@router.delete("/hotels/{hotel_id}")
async def deactivate_hotel(
    hotel_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Hotel).where(Hotel.id == hotel_id))
    hotel = result.scalar_one_or_none()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    hotel.is_active = False
    await db.commit()
    return {"message": f"Hotel {hotel.name} deactivated"}


# ═══════════════════════════════════════════
# CASHIERS
# ═══════════════════════════════════════════

@router.get("/cashiers", response_model=list[AdminCashierOut])
async def list_cashiers(
    status: str | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Cashier)
    if status:
        query = query.where(Cashier.status == status)
    result = await db.execute(query.order_by(Cashier.created_at.desc()))
    cashiers = result.scalars().all()

    out = []
    for c in cashiers:
        hotel_name = None
        if c.hotel_id:
            hr = await db.execute(select(Hotel.name).where(Hotel.id == c.hotel_id))
            hotel_name = hr.scalar_one_or_none()
        out.append(AdminCashierOut(
            id=c.id, name=c.name, phone=c.phone, email=c.email,
            ref_code=c.ref_code, hotel_id=c.hotel_id, hotel_name=hotel_name,
            commission_pct=float(c.commission_pct) if c.commission_pct else None,
            status=c.status, total_referrals=c.total_referrals,
            total_earnings=float(c.total_earnings), created_at=c.created_at,
        ))
    return out


@router.put("/cashiers/{cashier_id}/approve")
async def approve_cashier(
    cashier_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id, Cashier.status == "pending"))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found or not pending")

    cashier.status = "active"
    cashier.approved_at = datetime.now(timezone.utc)
    cashier.approved_by = admin.id
    await db.commit()
    return {"message": f"Cashier {cashier.name} approved", "ref_code": cashier.ref_code}


@router.put("/cashiers/{cashier_id}/reject")
async def reject_cashier(
    cashier_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id, Cashier.status == "pending"))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found or not pending")
    cashier.status = "inactive"
    await db.commit()
    return {"message": f"Cashier {cashier.name} rejected"}


# ═══════════════════════════════════════════
# UPSALES
# ═══════════════════════════════════════════

@router.get("/upsales", response_model=list[UpsaleOut])
async def list_upsales(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upsale).order_by(Upsale.created_at.desc()))
    return result.scalars().all()


@router.post("/upsales", response_model=UpsaleOut)
async def create_upsale(
    req: UpsaleCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    upsale = Upsale(**req.model_dump(), created_by=admin.id)
    db.add(upsale)
    await db.commit()
    await db.refresh(upsale)
    return upsale


@router.put("/upsales/{upsale_id}")
async def update_upsale(
    upsale_id: str, req: UpsaleCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Upsale).where(Upsale.id == upsale_id))
    upsale = result.scalar_one_or_none()
    if not upsale:
        raise HTTPException(status_code=404, detail="Upsale not found")
    for key, value in req.model_dump().items():
        setattr(upsale, key, value)
    await db.commit()
    return {"message": "Upsale updated"}


@router.put("/upsales/{upsale_id}/toggle")
async def toggle_upsale(
    upsale_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Upsale).where(Upsale.id == upsale_id))
    upsale = result.scalar_one_or_none()
    if not upsale:
        raise HTTPException(status_code=404, detail="Upsale not found")
    upsale.is_active = not upsale.is_active
    await db.commit()
    return {"message": f"Upsale {'activated' if upsale.is_active else 'deactivated'}"}


# ═══════════════════════════════════════════
# COMMON ROUTES
# ═══════════════════════════════════════════

@router.get("/common-routes", response_model=list[CommonRouteOut])
async def admin_list_routes(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CommonRoute).order_by(CommonRoute.sort_order))
    return result.scalars().all()


@router.post("/common-routes", response_model=CommonRouteOut)
async def create_route(
    req: RouteCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    route = CommonRoute(**req.model_dump())
    db.add(route)
    await db.commit()
    await db.refresh(route)
    return route


@router.put("/common-routes/{route_id}")
async def update_route(
    route_id: str, req: RouteCreateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CommonRoute).where(CommonRoute.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    for key, value in req.model_dump().items():
        setattr(route, key, value)
    await db.commit()
    return {"message": "Route updated"}


@router.delete("/common-routes/{route_id}")
async def delete_route(
    route_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CommonRoute).where(CommonRoute.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    route.is_active = False
    await db.commit()
    return {"message": "Route deactivated"}


# ═══════════════════════════════════════════
# VEHICLE RATES + EXTRAS
# ═══════════════════════════════════════════

@router.get("/vehicle-rates", response_model=list[VehicleRateOut])
async def admin_list_rates(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VehicleRate).order_by(VehicleRate.sort_order))
    return result.scalars().all()


@router.put("/vehicle-rates/{rate_id}")
async def update_rate(
    rate_id: str,
    base_fare: float | None = None,
    per_mile_rate: float | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(VehicleRate).where(VehicleRate.id == rate_id))
    rate = result.scalar_one_or_none()
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    if base_fare is not None:
        rate.base_fare = base_fare
    if per_mile_rate is not None:
        rate.per_mile_rate = per_mile_rate
    await db.commit()
    return {"message": f"{rate.display_name} rate updated"}


@router.get("/extras", response_model=list[ExtraOut])
async def admin_list_extras(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Extra))
    return result.scalars().all()


@router.put("/extras/{extra_id}")
async def update_extra(
    extra_id: str,
    price: float | None = None,
    is_active: bool | None = None,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Extra).where(Extra.id == extra_id))
    extra = result.scalar_one_or_none()
    if not extra:
        raise HTTPException(status_code=404, detail="Extra not found")
    if price is not None:
        extra.price = price
    if is_active is not None:
        extra.is_active = is_active
    await db.commit()
    return {"message": f"{extra.name} updated"}


# ═══════════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════════

@router.get("/settings", response_model=list[SettingOut])
async def list_settings(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Setting))
    return result.scalars().all()


@router.put("/settings")
async def update_setting(
    req: SettingUpdateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Setting).where(Setting.key == req.key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{req.key}' not found")
    setting.value = req.value
    setting.updated_by = admin.id
    await db.commit()
    return {"message": f"Setting '{req.key}' updated"}
