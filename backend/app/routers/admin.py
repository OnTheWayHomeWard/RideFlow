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
from app.services.split_service import get_setting_value
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

    from app.schemas.admin import PeriodStats

    async def get_period_stats(start_date) -> PeriodStats:
        # Rides + total revenue — by completed_at (when ride was actually done)
        start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
        r = await db.execute(
            select(func.count(Booking.id), func.coalesce(func.sum(Booking.total_amount), 0))
            .where(Booking.status == "completed", Booking.completed_at >= start_dt)
        )
        rides, total_rev = r.one()

        # Splits breakdown — only from completed rides, by completed_at
        async def sum_splits(recipient_type):
            r = await db.execute(
                select(func.coalesce(func.sum(PaymentSplit.amount), 0))
                .join(Booking, PaymentSplit.booking_id == Booking.id)
                .where(
                    PaymentSplit.recipient_type == recipient_type,
                    Booking.status == "completed",
                    Booking.completed_at >= start_dt,
                )
            )
            return float(r.scalar())

        driver_pay = await sum_splits("driver")
        cashier_pay = await sum_splits("cashier")
        company_rev = await sum_splits("company")

        return PeriodStats(
            rides=rides,
            total_revenue=float(total_rev),
            company_revenue=company_rev,
            driver_payouts=driver_pay,
            cashier_payouts=cashier_pay,
        )

    today_stats = await get_period_stats(today)
    week_stats = await get_period_stats(week_start)
    month_stats = await get_period_stats(month_start)

    # Booking status counts (all time)
    async def count_status(status):
        r = await db.execute(select(func.count()).select_from(Booking).where(Booking.status == status))
        return r.scalar()

    # Pending actions
    r = await db.execute(select(func.count()).select_from(PaymentSplit).where(PaymentSplit.payout_status == "pending_review"))
    pending_payouts = r.scalar()
    r = await db.execute(select(func.count()).select_from(Driver).where(Driver.status == "pending"))
    pending_drivers = r.scalar()
    r = await db.execute(select(func.count()).select_from(Cashier).where(Cashier.status == "pending"))
    pending_cashiers = r.scalar()

    # Fleet counts
    r = await db.execute(select(func.count()).select_from(Driver).where(Driver.status == "active"))
    active_drivers = r.scalar()
    r = await db.execute(select(func.count()).select_from(Driver))
    total_drivers = r.scalar()
    r = await db.execute(select(func.count()).select_from(Cashier).where(Cashier.status == "active"))
    total_cashiers = r.scalar()
    r = await db.execute(select(func.count()).select_from(Hotel).where(Hotel.is_active == True))
    total_hotels = r.scalar()

    # Rides per day (last 14 days) — by completed_at date (when ride actually finished)
    rides_per_day = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        next_d = d + timedelta(days=1)
        r = await db.execute(
            select(func.count(Booking.id), func.coalesce(func.sum(Booking.total_amount), 0))
            .where(
                Booking.status == "completed",
                Booking.completed_at >= datetime(d.year, d.month, d.day, tzinfo=timezone.utc),
                Booking.completed_at < datetime(next_d.year, next_d.month, next_d.day, tzinfo=timezone.utc),
            )
        )
        count, rev = r.one()
        rides_per_day.append({"date": d.strftime("%b %d"), "rides": count, "revenue": float(rev)})

    # Revenue per day (last 14 days — company revenue) — by completed_at date
    revenue_per_day = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        next_d = d + timedelta(days=1)
        r = await db.execute(
            select(func.coalesce(func.sum(PaymentSplit.amount), 0))
            .join(Booking, PaymentSplit.booking_id == Booking.id)
            .where(
                PaymentSplit.recipient_type == "company",
                Booking.status == "completed",
                Booking.completed_at >= datetime(d.year, d.month, d.day, tzinfo=timezone.utc),
                Booking.completed_at < datetime(next_d.year, next_d.month, next_d.day, tzinfo=timezone.utc),
            )
        )
        company = float(r.scalar())
        revenue_per_day.append({"date": d.strftime("%b %d"), "company": company})

    # Top drivers this month (by completed rides) — use subquery to avoid join duplicates
    r = await db.execute(
        select(
            Driver.name,
            func.count(func.distinct(Booking.id)).label("rides"),
        )
        .join(Booking, Booking.driver_id == Driver.id)
        .where(Booking.status == "completed", Booking.pickup_date >= month_start)
        .group_by(Driver.id, Driver.name)
        .order_by(func.count(func.distinct(Booking.id)).desc())
        .limit(5)
    )
    top_drivers_raw = r.all()
    top_drivers = []
    for row in top_drivers_raw:
        # Get actual earnings from splits
        er = await db.execute(
            select(func.coalesce(func.sum(PaymentSplit.amount), 0))
            .join(Booking, PaymentSplit.booking_id == Booking.id)
            .join(Driver, Booking.driver_id == Driver.id)
            .where(
                Driver.name == row[0],
                PaymentSplit.recipient_type == "driver",
                Booking.status == "completed",
                Booking.pickup_date >= month_start,
            )
        )
        earnings = float(er.scalar())
        top_drivers.append({"name": row[0], "rides": row[1], "earnings": earnings})

    # Top hotels this month (by completed ride referrals)
    r = await db.execute(
        select(
            Hotel.name,
            func.count(Booking.id).label("rides"),
            func.coalesce(func.sum(Booking.total_amount), 0).label("revenue"),
        )
        .join(Booking, Booking.hotel_id == Hotel.id)
        .where(Booking.status == "completed", Booking.pickup_date >= month_start)
        .group_by(Hotel.id, Hotel.name)
        .order_by(func.count(Booking.id).desc())
        .limit(5)
    )
    top_hotels = [{"name": row[0], "rides": row[1], "revenue": float(row[2])} for row in r.all()]

    # Recent bookings (last 10)
    r = await db.execute(
        select(Booking).order_by(Booking.created_at.desc()).limit(10)
    )
    recent = []
    for b in r.scalars().all():
        driver_name = None
        if b.driver_id:
            dr = await db.execute(select(Driver.name).where(Driver.id == b.driver_id))
            driver_name = dr.scalar_one_or_none()
        recent.append({
            "booking_number": b.booking_number,
            "client_name": b.client_name,
            "route": f"{b.pickup_name} → {b.dropoff_name}",
            "amount": float(b.total_amount),
            "status": b.status,
            "vehicle_type": b.vehicle_type,
            "driver_name": driver_name,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        })

    return DashboardStats(
        today=today_stats,
        this_week=week_stats,
        this_month=month_stats,
        pending_bookings=await count_status("pending"),
        paid_bookings=await count_status("paid"),
        assigned_bookings=await count_status("assigned"),
        in_progress_bookings=await count_status("in_progress"),
        completed_bookings=await count_status("completed"),
        pending_payouts=pending_payouts,
        pending_driver_approvals=pending_drivers,
        pending_cashier_approvals=pending_cashiers,
        active_drivers=active_drivers,
        total_drivers=total_drivers,
        total_cashiers=total_cashiers,
        total_hotels=total_hotels,
        rides_per_day=rides_per_day,
        revenue_per_day=revenue_per_day,
        top_drivers=top_drivers,
        top_hotels=top_hotels,
        recent_bookings=recent,
    )


# ═══════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════

@router.get("/notifications")
async def get_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Build admin notifications from real DB events.
    Returns the latest events that need admin attention.
    """
    notifications = []

    # 1. Pending payout requests (ride completed, needs verification)
    r = await db.execute(
        select(PaymentSplit, Booking, Driver)
        .join(Booking, PaymentSplit.booking_id == Booking.id)
        .outerjoin(Driver, PaymentSplit.recipient_id == Driver.id)
        .where(PaymentSplit.recipient_type == "driver", PaymentSplit.payout_status == "pending_review")
        .order_by(PaymentSplit.created_at.desc())
        .limit(10)
    )
    for split, booking, driver in r.all():
        notifications.append({
            "id": str(split.id),
            "type": "payout_request",
            "icon": "dollar",
            "color": "amber",
            "title": f"Payout request — ${float(split.amount):.2f}",
            "message": f"{driver.name if driver else 'Driver'} completed {booking.booking_number} ({booking.pickup_name} → {booking.dropoff_name})",
            "link": "/payouts",
            "time": booking.completed_at.isoformat() if booking.completed_at else split.created_at.isoformat(),
        })

    # 2. New bookings (paid, no driver yet)
    r = await db.execute(
        select(Booking)
        .where(Booking.status == "paid", Booking.driver_id.is_(None))
        .order_by(Booking.paid_at.desc())
        .limit(10)
    )
    for b in r.scalars().all():
        notifications.append({
            "id": str(b.id),
            "type": "new_booking",
            "icon": "booking",
            "color": "blue",
            "title": f"New ride — {b.booking_number}",
            "message": f"{b.client_name}: {b.pickup_name} → {b.dropoff_name} • ${float(b.total_amount):.2f}",
            "link": "/runs",
            "time": b.paid_at.isoformat() if b.paid_at else b.created_at.isoformat(),
        })

    # 3. Driver accepted a run
    r = await db.execute(
        select(Booking, Driver)
        .join(Driver, Booking.driver_id == Driver.id)
        .where(Booking.status == "assigned")
        .order_by(Booking.assigned_at.desc())
        .limit(5)
    )
    for b, d in r.all():
        notifications.append({
            "id": f"assign-{b.id}",
            "type": "driver_accepted",
            "icon": "check",
            "color": "green",
            "title": f"{d.name} accepted a run",
            "message": f"{b.booking_number}: {b.pickup_name} → {b.dropoff_name}",
            "link": "/runs",
            "time": b.assigned_at.isoformat() if b.assigned_at else b.created_at.isoformat(),
        })

    # 4. Pending driver registrations
    r = await db.execute(
        select(Driver).where(Driver.status == "pending").order_by(Driver.created_at.desc()).limit(5)
    )
    for d in r.scalars().all():
        notifications.append({
            "id": f"dreg-{d.id}",
            "type": "driver_registration",
            "icon": "user",
            "color": "purple",
            "title": "New driver registration",
            "message": f"{d.name} — {d.vehicle_type.upper()} ({d.vehicle_make or 'N/A'})",
            "link": "/drivers",
            "time": d.created_at.isoformat(),
        })

    # 5. Pending cashier registrations
    r = await db.execute(
        select(Cashier).where(Cashier.status == "pending").order_by(Cashier.created_at.desc()).limit(5)
    )
    for c in r.scalars().all():
        notifications.append({
            "id": f"creg-{c.id}",
            "type": "cashier_registration",
            "icon": "user",
            "color": "indigo",
            "title": "New cashier registration",
            "message": f"{c.name} — {c.phone}",
            "link": "/cashiers",
            "time": c.created_at.isoformat(),
        })

    # Sort all by time descending
    notifications.sort(key=lambda x: x["time"], reverse=True)

    total = len(notifications)
    start = (page - 1) * per_page
    end = start + per_page
    paginated = notifications[start:end]

    return {
        "notifications": paginated,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


# ═══════════════════════════════════════════
# PAYOUT REQUESTS
# ═══════════════════════════════════════════

@router.get("/payouts")
async def list_payouts(
    status: str = Query("pending_review"),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List payout requests. Filter by status: pending_review, released, flagged, rejected."""
    total = (await db.execute(
        select(func.count(PaymentSplit.id)).where(PaymentSplit.recipient_type == "driver", PaymentSplit.payout_status == status)
    )).scalar()

    result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.recipient_type == "driver",
            PaymentSplit.payout_status == status,
        ).order_by(PaymentSplit.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
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

        # Get client rating/comment if exists
        from app.models.rating import Rating
        rating_result = await db.execute(select(Rating).where(Rating.booking_id == b.id))
        rating = rating_result.scalar_one_or_none()

        payouts.append(PayoutRequestOut(
            split_id=s.id,
            booking_number=b.booking_number,
            booking_id=b.id,
            pickup_name=b.pickup_name,
            dropoff_name=b.dropoff_name,
            pickup_date=b.pickup_date,
            pickup_time=b.pickup_time,
            ordered_at=b.created_at,
            completed_at=b.completed_at,
            driver_name=d.name if d else "Unknown",
            driver_phone=d.phone if d else "",
            driver_id=s.recipient_id,
            client_name=b.client_name,
            client_phone=b.client_phone,
            vehicle_type=b.vehicle_type,
            total_fare=float(b.total_amount),
            driver_amount=float(s.amount),
            company_profit=float(company_split.amount) if company_split else 0,
            cashier_amount=float(cashier_split.amount) if cashier_split else 0,
            start_location=b.start_location,
            end_location=b.end_location,
            payout_status=s.payout_status,
            client_rating=rating.rating if rating else None,
            client_comment=rating.comment if rating else None,
        ))

    return {"items": payouts, "total": total, "page": page, "per_page": per_page, "total_pages": (total + per_page - 1) // per_page}


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

@router.get("/bookings")
async def list_bookings(
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    # Build filter
    filters = []
    if status:
        filters.append(Booking.status == status)
    if date_from:
        filters.append(Booking.pickup_date >= date_from)
    if date_to:
        filters.append(Booking.pickup_date <= date_to)

    # Total count
    count_query = select(func.count(Booking.id))
    for f in filters:
        count_query = count_query.where(f)
    total = (await db.execute(count_query)).scalar()

    # Paginated data
    query = select(Booking)
    for f in filters:
        query = query.where(f)
    query = query.order_by(Booking.created_at.desc()).offset((page - 1) * per_page).limit(per_page)

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

        # Get rating/feedback
        from app.models.rating import Rating as RatingModel
        rating_result = await db.execute(select(RatingModel).where(RatingModel.booking_id == b.id))
        rating_obj = rating_result.scalar_one_or_none()

        out.append(AdminBookingOut(
            id=b.id, booking_number=b.booking_number,
            client_name=b.client_name, client_phone=b.client_phone,
            pickup_name=b.pickup_name, dropoff_name=b.dropoff_name,
            pickup_date=b.pickup_date, pickup_time=b.pickup_time,
            vehicle_type=b.vehicle_type, passengers=b.passengers,
            total_amount=float(b.total_amount), status=b.status,
            driver_name=driver_name, hotel_name=hotel_name, cashier_name=cashier_name,
            client_rating=rating_obj.rating if rating_obj else None,
            client_comment=rating_obj.comment if rating_obj else None,
            created_at=b.created_at,
        ))
    return {
        "bookings": out,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


# ═══════════════════════════════════════════
# DRIVERS
# ═══════════════════════════════════════════

@router.post("/drivers")
async def create_driver(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    name: str = Query(...), phone: str = Query(...), email: str = Query(""),
    password: str = Query(...),
    vehicle_type: str = Query(...), vehicle_make: str = Query(""), vehicle_plate: str = Query(""),
    vehicle_color: str = Query(""), license_number: str = Query(""),
    has_insurance: bool = Query(False), pay_percentage: float = Query(70),
    payout_method: str = Query("bank"),
):
    """Admin creates a driver — active immediately, no approval needed."""
    existing = await db.execute(select(Driver).where(Driver.phone == phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already registered")

    default_pct = float(await get_setting_value(db, "default_driver_pay_pct", 70))
    driver = Driver(
        name=name, phone=phone, email=email or None,
        password_hash=hash_password(password),
        vehicle_type=vehicle_type, vehicle_make=vehicle_make or None,
        vehicle_plate=vehicle_plate or None, vehicle_color=vehicle_color or None,
        license_number=license_number or None, has_insurance=has_insurance,
        pay_percentage=pay_percentage or default_pct,
        payout_method=payout_method,
        status="active",
        approved_at=datetime.now(timezone.utc),
        approved_by=admin.id,
    )
    db.add(driver)
    await db.commit()
    return {"message": f"Driver {name} created", "id": str(driver.id)}


@router.get("/drivers")
async def list_drivers(
    status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if status:
        filters.append(Driver.status == status)

    count_q = select(func.count(Driver.id))
    for f in filters:
        count_q = count_q.where(f)
    total = (await db.execute(count_q)).scalar()

    query = select(Driver)
    for f in filters:
        query = query.where(f)
    query = query.order_by(Driver.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    drivers = result.scalars().all()

    # Calculate live ratings from ratings table
    from app.models.rating import Rating as RatingModel
    out = []
    for d in drivers:
        avg_r = await db.execute(
            select(func.avg(RatingModel.rating), func.count(RatingModel.id))
            .join(Booking, RatingModel.booking_id == Booking.id)
            .where(Booking.driver_id == d.id)
        )
        avg_rating, rating_count = avg_r.one()

        out.append({
            "id": d.id,
            "name": d.name,
            "phone": d.phone,
            "email": d.email,
            "vehicle_type": d.vehicle_type,
            "vehicle_make": d.vehicle_make,
            "vehicle_plate": d.vehicle_plate,
            "vehicle_color": d.vehicle_color,
            "license_number": d.license_number,
            "has_insurance": d.has_insurance,
            "payout_method": d.payout_method,
            "status": d.status,
            "pay_percentage": float(d.pay_percentage),
            "rating_avg": round(float(avg_rating), 1) if avg_rating else 0,
            "rating_count": rating_count or 0,
            "total_rides": d.total_rides,
            "total_earnings": float(d.total_earnings),
            "created_at": d.created_at,
            "approved_at": d.approved_at,
        })

    return {"items": out, "total": total, "page": page, "per_page": per_page, "total_pages": (total + per_page - 1) // per_page}


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


@router.get("/drivers/{driver_id}")
async def get_driver_detail(
    driver_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Full driver detail with runs, ratings, earnings breakdown."""
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Runs with ratings
    from app.models.rating import Rating as RatingModel
    runs_result = await db.execute(
        select(Booking).where(Booking.driver_id == driver.id)
        .order_by(Booking.created_at.desc()).limit(50)
    )
    runs = []
    for b in runs_result.scalars().all():
        rating_r = await db.execute(select(RatingModel).where(RatingModel.booking_id == b.id))
        rating_obj = rating_r.scalar_one_or_none()

        # Get driver split amount for this run
        split_r = await db.execute(
            select(PaymentSplit).where(
                PaymentSplit.booking_id == b.id,
                PaymentSplit.recipient_type == "driver",
            )
        )
        split = split_r.scalar_one_or_none()

        runs.append({
            "booking_number": b.booking_number,
            "pickup_name": b.pickup_name,
            "dropoff_name": b.dropoff_name,
            "pickup_date": str(b.pickup_date),
            "pickup_time": str(b.pickup_time),
            "vehicle_type": b.vehicle_type,
            "status": b.status,
            "client_name": b.client_name,
            "driver_earnings": float(split.amount) if split else 0,
            "payout_status": split.payout_status if split else None,
            "rating": rating_obj.rating if rating_obj else None,
            "comment": rating_obj.comment if rating_obj else None,
        })

    # Earnings summary
    from sqlalchemy import func as sqlfunc
    earnings_r = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(PaymentSplit.amount), 0))
        .where(PaymentSplit.recipient_id == driver.id, PaymentSplit.recipient_type == "driver")
    )
    total_earned = float(earnings_r.scalar())

    released_r = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(PaymentSplit.amount), 0))
        .where(PaymentSplit.recipient_id == driver.id, PaymentSplit.recipient_type == "driver", PaymentSplit.payout_status == "released")
    )
    total_released = float(released_r.scalar())

    pending_r = await db.execute(
        select(sqlfunc.coalesce(sqlfunc.sum(PaymentSplit.amount), 0))
        .where(PaymentSplit.recipient_id == driver.id, PaymentSplit.recipient_type == "driver", PaymentSplit.payout_status == "pending_review")
    )
    total_pending = float(pending_r.scalar())

    # Ride counts
    status_counts = {}
    for s in ["assigned", "in_progress", "completed"]:
        cr = await db.execute(
            select(sqlfunc.count()).select_from(Booking).where(Booking.driver_id == driver.id, Booking.status == s)
        )
        status_counts[s] = cr.scalar()

    # Average rating
    avg_r = await db.execute(
        select(sqlfunc.avg(RatingModel.rating), sqlfunc.count(RatingModel.id))
        .join(Booking, RatingModel.booking_id == Booking.id)
        .where(Booking.driver_id == driver.id)
    )
    avg_rating, total_ratings = avg_r.one()

    return {
        "driver": {
            "id": str(driver.id),
            "name": driver.name,
            "phone": driver.phone,
            "email": driver.email,
            "photo_url": driver.photo_url,
            "vehicle_type": driver.vehicle_type,
            "vehicle_make": driver.vehicle_make,
            "vehicle_plate": driver.vehicle_plate,
            "vehicle_color": driver.vehicle_color,
            "license_number": driver.license_number,
            "license_expiry": str(driver.license_expiry) if driver.license_expiry else None,
            "has_insurance": driver.has_insurance,
            "payout_method": driver.payout_method,
            "payout_details": driver.payout_details,
            "stripe_connect_id": driver.stripe_connect_id,
            "pay_percentage": float(driver.pay_percentage),
            "status": driver.status,
            "rejection_reason": driver.rejection_reason,
            "created_at": driver.created_at.isoformat() if driver.created_at else None,
            "approved_at": driver.approved_at.isoformat() if driver.approved_at else None,
        },
        "stats": {
            "total_rides": status_counts.get("completed", 0),
            "assigned_rides": status_counts.get("assigned", 0),
            "in_progress_rides": status_counts.get("in_progress", 0),
            "total_earned": total_earned,
            "total_released": total_released,
            "total_pending": total_pending,
            "avg_rating": round(float(avg_rating), 1) if avg_rating else 0,
            "total_ratings": total_ratings,
        },
        "runs": runs,
        "global_default_pay_pct": float(await get_setting_value(db, "default_driver_pay_pct", 70)),
    }


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

    for field in ["name", "phone", "email", "vehicle_type", "vehicle_make",
                   "vehicle_plate", "vehicle_color", "license_number",
                   "has_insurance", "pay_percentage", "payout_method", "status"]:
        value = getattr(req, field, None)
        if value is not None:
            setattr(driver, field, value)

    # Handle payout details — always overwrite (clears old data when method changes)
    if req.payout_details is not None:
        driver.payout_details = req.payout_details if req.payout_details else None

    # Handle stripe — empty string means clear it
    if req.stripe_connect_id is not None:
        driver.stripe_connect_id = req.stripe_connect_id if req.stripe_connect_id else None

    # Handle date field separately
    if req.license_expiry:
        from datetime import date as date_type
        driver.license_expiry = date_type.fromisoformat(req.license_expiry)

    await db.commit()
    return {"message": f"Driver {driver.name} updated"}


@router.delete("/drivers/{driver_id}")
async def delete_driver(
    driver_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    # Soft delete — set inactive
    driver.status = "inactive"
    await db.commit()
    return {"message": f"Driver {driver.name} deactivated"}


# ═══════════════════════════════════════════
# HOTELS
# ═══════════════════════════════════════════

@router.get("/hotels")
async def list_hotels(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count(Hotel.id)))).scalar()
    result = await db.execute(select(Hotel).order_by(Hotel.name).offset((page - 1) * per_page).limit(per_page))
    hotels = result.scalars().all()
    items = []
    for h in hotels:
        items.append({
            "id": str(h.id), "name": h.name, "address": h.address,
            "lat": float(h.lat) if h.lat else None, "lng": float(h.lng) if h.lng else None,
            "contact_name": h.contact_name, "contact_phone": h.contact_phone,
            "default_commission_pct": float(h.default_commission_pct), "is_active": h.is_active,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        })
    return {"items": items, "total": total, "page": page, "per_page": per_page, "total_pages": (total + per_page - 1) // per_page}


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


@router.put("/hotels/{hotel_id}/activate")
async def activate_hotel(
    hotel_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Hotel).where(Hotel.id == hotel_id))
    hotel = result.scalar_one_or_none()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    hotel.is_active = True
    await db.commit()
    return {"message": f"Hotel {hotel.name} activated"}


# ═══════════════════════════════════════════
# CASHIERS
# ═══════════════════════════════════════════

@router.post("/cashiers")
async def create_cashier(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    name: str = Query(...), phone: str = Query(...), email: str = Query(""),
    hotel_id: str = Query(""), commission_pct: float | None = Query(None),
):
    """Admin creates a cashier — active immediately. Default password = last 4 digits of phone."""
    # Auto-generate password from last 4 digits of phone
    digits = ''.join(c for c in phone if c.isdigit())
    default_password = digits[-4:] if len(digits) >= 4 else digits or "0000"

    ref_code = generate_ref_code()
    while True:
        existing = await db.execute(select(Cashier).where(Cashier.ref_code == ref_code))
        if not existing.scalar_one_or_none():
            break
        ref_code = generate_ref_code()

    cashier = Cashier(
        name=name, phone=phone, email=email or None,
        password_hash=hash_password(default_password),
        hotel_id=hotel_id if hotel_id else None,
        ref_code=ref_code,
        commission_pct=commission_pct,
        password_changed=False,
        status="active",
        approved_at=datetime.now(timezone.utc),
        approved_by=admin.id,
    )
    db.add(cashier)
    await db.commit()
    return {"message": f"Cashier {name} created", "id": str(cashier.id), "ref_code": ref_code, "default_password": default_password}


@router.get("/cashiers")
async def list_cashiers(
    status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if status:
        filters.append(Cashier.status == status)

    count_q = select(func.count(Cashier.id))
    for f in filters:
        count_q = count_q.where(f)
    total = (await db.execute(count_q)).scalar()

    query = select(Cashier)
    for f in filters:
        query = query.where(f)
    result = await db.execute(query.order_by(Cashier.created_at.desc()).offset((page - 1) * per_page).limit(per_page))
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
    return {"items": out, "total": total, "page": page, "per_page": per_page, "total_pages": (total + per_page - 1) // per_page}


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


@router.put("/cashiers/{cashier_id}/toggle")
async def toggle_cashier(
    cashier_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")
    cashier.status = "inactive" if cashier.status == "active" else "active"
    await db.commit()
    return {"message": f"Cashier {cashier.name} {'activated' if cashier.status == 'active' else 'deactivated'}"}


@router.delete("/cashiers/{cashier_id}")
async def delete_cashier(
    cashier_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")
    cashier.status = "inactive"
    await db.commit()
    return {"message": f"Cashier {cashier.name} deactivated"}


@router.get("/cashiers/{cashier_id}/qr")
async def generate_qr(
    cashier_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate a QR code for a cashier with company branding."""
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")

    hotel_name = ""
    if cashier.hotel_id:
        hr = await db.execute(select(Hotel.name).where(Hotel.id == cashier.hotel_id))
        hotel_name = hr.scalar_one_or_none() or ""

    company_name = str(await get_setting_value(db, "company_name", "RideFlow"))
    company_phone = str(await get_setting_value(db, "company_phone", ""))

    from app.services.qr_service import generate_cashier_qr
    qr_base64 = generate_cashier_qr(
        ref_code=cashier.ref_code,
        cashier_name=cashier.name,
        hotel_name=hotel_name,
        company_name=company_name,
    )

    return {
        "qr_image": qr_base64,
        "ref_code": cashier.ref_code,
        "cashier_name": cashier.name,
        "hotel_name": hotel_name,
        "company_name": company_name,
        "company_phone": company_phone,
        "booking_url": f"http://localhost:5173/book?ref={cashier.ref_code}",
    }


@router.get("/cashiers/{cashier_id}")
async def get_cashier_detail(
    cashier_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Full cashier detail with referrals, earnings, payout info."""
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")

    hotel_name = ""
    if cashier.hotel_id:
        hr = await db.execute(select(Hotel.name).where(Hotel.id == cashier.hotel_id))
        hotel_name = hr.scalar_one_or_none() or ""

    # Referral bookings
    bookings_r = await db.execute(
        select(Booking).where(Booking.cashier_id == cashier.id)
        .order_by(Booking.created_at.desc()).limit(50)
    )
    referrals = []
    for b in bookings_r.scalars().all():
        # Get cashier split for this booking
        split_r = await db.execute(
            select(PaymentSplit).where(
                PaymentSplit.booking_id == b.id,
                PaymentSplit.recipient_type == "cashier",
            )
        )
        split = split_r.scalar_one_or_none()
        referrals.append({
            "booking_number": b.booking_number,
            "client_name": b.client_name,
            "pickup_name": b.pickup_name,
            "dropoff_name": b.dropoff_name,
            "pickup_date": str(b.pickup_date),
            "total_amount": float(b.total_amount),
            "commission": float(split.amount) if split else 0,
            "status": b.status,
        })

    # Earnings
    total_earned_r = await db.execute(
        select(func.coalesce(func.sum(PaymentSplit.amount), 0))
        .where(PaymentSplit.recipient_id == cashier.id, PaymentSplit.recipient_type == "cashier")
    )
    total_earned = float(total_earned_r.scalar())

    default_commission = float(await get_setting_value(db, "default_cashier_commission_pct", 10))

    return {
        "cashier": {
            "id": str(cashier.id),
            "name": cashier.name,
            "phone": cashier.phone,
            "email": cashier.email,
            "ref_code": cashier.ref_code,
            "hotel_id": str(cashier.hotel_id) if cashier.hotel_id else None,
            "hotel_name": hotel_name,
            "commission_pct": float(cashier.commission_pct) if cashier.commission_pct else None,
            "status": cashier.status,
            "password_changed": cashier.password_changed,
            "default_password": ''.join(c for c in cashier.phone if c.isdigit())[-4:],
            "payout_method": cashier.payout_method,
            "payout_details": cashier.payout_details,
            "stripe_connect_id": cashier.stripe_connect_id,
            "total_referrals": cashier.total_referrals,
            "total_earnings": float(cashier.total_earnings),
            "created_at": cashier.created_at.isoformat() if cashier.created_at else None,
            "approved_at": cashier.approved_at.isoformat() if cashier.approved_at else None,
        },
        "stats": {
            "total_referrals": len(referrals),
            "total_earned": total_earned,
        },
        "referrals": referrals,
        "global_default_commission_pct": default_commission,
        "hotels": [{"id": str(h.id), "name": h.name, "commission_pct": float(h.default_commission_pct)}
                   for h in (await db.execute(select(Hotel).where(Hotel.is_active == True).order_by(Hotel.name))).scalars().all()],
    }


@router.put("/cashiers/{cashier_id}")
async def update_cashier(
    cashier_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    hotel_id: str | None = None,
    commission_pct: float | None = None,
    payout_method: str | None = None,
    payout_details: str | None = None,
    stripe_connect_id: str | None = None,
):
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")

    if name: cashier.name = name
    if phone: cashier.phone = phone
    if email is not None: cashier.email = email or None
    if hotel_id is not None:
        cashier.hotel_id = hotel_id if hotel_id else None
    if commission_pct is not None: cashier.commission_pct = commission_pct
    if payout_method: cashier.payout_method = payout_method

    # Handle payout details — parse JSON string from query param
    if payout_details is not None:
        import json
        cashier.payout_details = json.loads(payout_details) if payout_details else None

    if stripe_connect_id is not None:
        cashier.stripe_connect_id = stripe_connect_id or None

    await db.commit()
    return {"message": f"Cashier {cashier.name} updated"}


@router.put("/cashiers/{cashier_id}/reset-password")
async def reset_cashier_password(
    cashier_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin resets cashier password back to default (last 4 digits of phone)."""
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")

    digits = ''.join(c for c in cashier.phone if c.isdigit())
    default_password = digits[-4:] if len(digits) >= 4 else digits or "0000"

    cashier.password_hash = hash_password(default_password)
    cashier.password_changed = False
    await db.commit()
    return {"message": f"Password reset to default for {cashier.name}", "default_password": default_password}


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
    new_state = not upsale.is_active

    # Only one upsale can be active at a time — deactivate all others
    if new_state:
        all_upsales = await db.execute(select(Upsale).where(Upsale.is_active == True))
        for other in all_upsales.scalars().all():
            other.is_active = False

    upsale.is_active = new_state
    await db.commit()
    return {"message": f"Upsale {'activated' if new_state else 'deactivated'}"}


@router.delete("/upsales/{upsale_id}")
async def delete_upsale(
    upsale_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Upsale).where(Upsale.id == upsale_id))
    upsale = result.scalar_one_or_none()
    if not upsale:
        raise HTTPException(status_code=404, detail="Upsale not found")
    await db.delete(upsale)
    await db.commit()
    return {"message": "Upsale deleted"}


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


@router.put("/common-routes/{route_id}/activate")
async def activate_route(
    route_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CommonRoute).where(CommonRoute.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    route.is_active = True
    await db.commit()
    return {"message": "Route activated"}


# ═══════════════════════════════════════════
# VEHICLE RATES
# ═══════════════════════════════════════════

@router.get("/vehicle-rates")
async def admin_list_rates(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VehicleRate).order_by(VehicleRate.sort_order))
    return result.scalars().all()


@router.post("/vehicle-rates")
async def create_rate(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    vehicle_type: str = Query(...), display_name: str = Query(...),
    base_fare: float = Query(...), per_mile_rate: float = Query(...),
    max_passengers: int = Query(...), max_luggage: int = Query(2),
    sort_order: int = Query(0),
):
    rate = VehicleRate(
        vehicle_type=vehicle_type.lower().replace(' ', '_'), display_name=display_name,
        base_fare=base_fare, per_mile_rate=per_mile_rate,
        max_passengers=max_passengers, max_luggage=max_luggage, sort_order=sort_order,
    )
    db.add(rate)
    await db.commit()
    await db.refresh(rate)
    return rate


@router.put("/vehicle-rates/{rate_id}")
async def update_rate(
    rate_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    display_name: str | None = None, base_fare: float | None = None,
    per_mile_rate: float | None = None, max_passengers: int | None = None,
    max_luggage: int | None = None, is_active: bool | None = None,
    sort_order: int | None = None,
):
    result = await db.execute(select(VehicleRate).where(VehicleRate.id == rate_id))
    rate = result.scalar_one_or_none()
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    if display_name is not None: rate.display_name = display_name
    if base_fare is not None: rate.base_fare = base_fare
    if per_mile_rate is not None: rate.per_mile_rate = per_mile_rate
    if max_passengers is not None: rate.max_passengers = max_passengers
    if max_luggage is not None: rate.max_luggage = max_luggage
    if is_active is not None: rate.is_active = is_active
    if sort_order is not None: rate.sort_order = sort_order
    await db.commit()
    return {"message": f"{rate.display_name} updated"}


@router.delete("/vehicle-rates/{rate_id}")
async def delete_rate(rate_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VehicleRate).where(VehicleRate.id == rate_id))
    rate = result.scalar_one_or_none()
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    rate.is_active = False
    await db.commit()
    return {"message": f"{rate.display_name} deactivated"}


# ═══════════════════════════════════════════
# EXTRAS
# ═══════════════════════════════════════════

@router.get("/extras")
async def admin_list_extras(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Extra))
    return result.scalars().all()


@router.post("/extras")
async def create_extra(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    name: str = Query(...), slug: str = Query(...),
    price: float = Query(...), description: str = Query(""),
):
    extra = Extra(name=name, slug=slug.lower().replace(' ', '_'), price=price, description=description)
    db.add(extra)
    await db.commit()
    await db.refresh(extra)
    return extra


@router.put("/extras/{extra_id}")
async def update_extra(
    extra_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    name: str | None = None, price: float | None = None,
    description: str | None = None, is_active: bool | None = None,
):
    result = await db.execute(select(Extra).where(Extra.id == extra_id))
    extra = result.scalar_one_or_none()
    if not extra:
        raise HTTPException(status_code=404, detail="Extra not found")
    if name is not None: extra.name = name
    if price is not None: extra.price = price
    if description is not None: extra.description = description
    if is_active is not None: extra.is_active = is_active
    await db.commit()
    return {"message": f"{extra.name} updated"}


@router.delete("/extras/{extra_id}")
async def delete_extra(extra_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Extra).where(Extra.id == extra_id))
    extra = result.scalar_one_or_none()
    if not extra:
        raise HTTPException(status_code=404, detail="Extra not found")
    extra.is_active = False
    await db.commit()
    return {"message": f"{extra.name} deactivated"}


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
