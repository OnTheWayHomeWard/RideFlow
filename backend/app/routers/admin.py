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
from app.utils.security import hash_password, verify_password
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
    r = await db.execute(select(func.count()).select_from(PaymentSplit).where(PaymentSplit.payout_status == "transfer_failed"))
    failed_transfers = r.scalar()
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
        failed_transfers=failed_transfers,
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
            "title": f"Payout pending — ${float(split.amount):.2f}",
            "message": f"{driver.name if driver else 'Driver'} • {booking.booking_number} ({booking.pickup_name} → {booking.dropoff_name})",
            "link": "/payouts",
            "time": booking.completed_at.isoformat() if booking.completed_at else split.created_at.isoformat(),
        })

    # Event log is built from timestamp fields, NOT current status — a single
    # booking can produce multiple notifications (paid → assigned → started → completed)
    # and they all stay visible in the timeline.
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    EVENT_LIMIT = 50

    # 2. New booking (when payment was received)
    r = await db.execute(
        select(Booking)
        .where(Booking.paid_at.is_not(None), Booking.paid_at >= cutoff)
        .order_by(Booking.paid_at.desc())
        .limit(EVENT_LIMIT)
    )
    for b in r.scalars().all():
        notifications.append({
            "id": f"paid-{b.id}",
            "type": "new_booking",
            "icon": "booking",
            "color": "blue",
            "title": f"New ride — {b.booking_number}",
            "message": f"{b.client_name}: {b.pickup_name} → {b.dropoff_name} • ${float(b.total_amount):.2f}",
            "link": f"/runs/{b.id}",
            "time": b.paid_at.isoformat(),
        })

    # 3. Driver accepted (assigned_at set)
    r = await db.execute(
        select(Booking, Driver)
        .join(Driver, Booking.driver_id == Driver.id)
        .where(Booking.assigned_at.is_not(None), Booking.assigned_at >= cutoff)
        .order_by(Booking.assigned_at.desc())
        .limit(EVENT_LIMIT)
    )
    for b, d in r.all():
        notifications.append({
            "id": f"assign-{b.id}",
            "type": "driver_accepted",
            "icon": "check",
            "color": "green",
            "title": f"{d.name} accepted a run",
            "message": f"{b.booking_number}: {b.pickup_name} → {b.dropoff_name}",
            "link": f"/runs/{b.id}",
            "time": b.assigned_at.isoformat(),
        })

    # 3b. Ride started (started_at set)
    r = await db.execute(
        select(Booking, Driver)
        .join(Driver, Booking.driver_id == Driver.id)
        .where(Booking.started_at.is_not(None), Booking.started_at >= cutoff)
        .order_by(Booking.started_at.desc())
        .limit(EVENT_LIMIT)
    )
    for b, d in r.all():
        notifications.append({
            "id": f"start-{b.id}",
            "type": "ride_started",
            "icon": "play",
            "color": "blue",
            "title": f"{d.name} started a ride",
            "message": f"{b.booking_number}: heading to {b.dropoff_name}",
            "link": f"/runs/{b.id}",
            "time": b.started_at.isoformat(),
        })

    # 3c. Ride completed (completed_at set)
    r = await db.execute(
        select(Booking, Driver)
        .join(Driver, Booking.driver_id == Driver.id)
        .where(Booking.completed_at.is_not(None), Booking.completed_at >= cutoff)
        .order_by(Booking.completed_at.desc())
        .limit(EVENT_LIMIT)
    )
    for b, d in r.all():
        notifications.append({
            "id": f"complete-{b.id}",
            "type": "ride_completed",
            "icon": "check-circle",
            "color": "emerald",
            "title": f"{d.name} completed a ride",
            "message": f"{b.booking_number}: {b.pickup_name} → {b.dropoff_name}",
            "link": f"/runs/{b.id}",
            "time": b.completed_at.isoformat(),
        })

    # 3d. Cancelled (cancelled_at set — fall back to created_at for legacy rows)
    r = await db.execute(
        select(Booking)
        .where(Booking.status == "cancelled",
               func.coalesce(Booking.cancelled_at, Booking.created_at) >= cutoff)
        .order_by(func.coalesce(Booking.cancelled_at, Booking.created_at).desc())
        .limit(EVENT_LIMIT)
    )
    for b in r.scalars().all():
        notifications.append({
            "id": f"cancel-{b.id}",
            "type": "ride_cancelled",
            "icon": "x",
            "color": "red",
            "title": f"Ride cancelled — {b.booking_number}",
            "message": f"{b.client_name}: {b.pickup_name} → {b.dropoff_name}",
            "link": f"/runs/{b.id}",
            "time": (b.cancelled_at or b.created_at).isoformat(),
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
    """List payout requests. Filter by status: pending_review, released, transfer_failed, flagged, rejected."""
    # For transfer_failed, include both driver and cashier splits. Others: driver only.
    recipient_types = ["driver", "cashier"] if status == "transfer_failed" else ["driver"]

    total = (await db.execute(
        select(func.count(PaymentSplit.id)).where(PaymentSplit.recipient_type.in_(recipient_types), PaymentSplit.payout_status == status)
    )).scalar()

    result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.recipient_type.in_(recipient_types),
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

        # Get driver (for display). If this is a cashier split, get the booking's driver.
        driver_id_to_lookup = s.recipient_id if s.recipient_type == "driver" else b.driver_id
        d = None
        if driver_id_to_lookup:
            d_result = await db.execute(select(Driver).where(Driver.id == driver_id_to_lookup))
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
            driver_id=driver_id_to_lookup,
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
            stripe_transfer_id=s.stripe_transfer_id,
            driver_stripe_connected=bool(d.stripe_connect_id) if d else False,
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

    # Update driver total earnings + execute Stripe Transfer if connected
    transfer_id = None
    if split.recipient_id:
        d_result = await db.execute(select(Driver).where(Driver.id == split.recipient_id))
        driver = d_result.scalar_one_or_none()
        if driver:
            driver.total_earnings = float(driver.total_earnings or 0) + float(split.amount)

            if driver.stripe_connect_id:
                try:
                    from app.services.connect_service import execute_transfer, get_account_details
                    acct_status = await get_account_details(driver.stripe_connect_id)
                    if not acct_status.get("charges_enabled") or not acct_status.get("payouts_enabled"):
                        split.payout_status = "transfer_failed"
                        split.paid_at = None
                        split.review_note = (split.review_note or "") + " [Stripe account not fully activated — charges_enabled or payouts_enabled is false]"
                    else:
                        transfer_id = await execute_transfer(db, split, driver.stripe_connect_id)
                        split.paid_at = datetime.now(timezone.utc)
                except Exception as e:
                    split.payout_status = "transfer_failed"
                    split.paid_at = None
                    split.review_note = (split.review_note or "") + f" [Stripe transfer failed: {str(e)}]"

    await db.commit()

    # SMS to driver
    if driver and driver.phone:
        try:
            booking_r = await db.execute(select(Booking).where(Booking.id == split.booking_id))
            b = booking_r.scalar_one_or_none()
            from app.services.sms_service import notify_driver_payout_released
            await notify_driver_payout_released(db, driver.phone, {
                "driver_name": driver.name, "amount": f"{float(split.amount):.2f}",
                "route": f"{b.pickup_name} → {b.dropoff_name}" if b else "", "booking_number": b.booking_number if b else "",
            })
            await db.commit()
        except Exception as e:
            print(f"[SMS ERROR] Driver payout released SMS failed: {e}")

    return {"message": "Payout released", "amount": float(split.amount), "stripe_transfer_id": transfer_id}


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

    # SMS to driver
    try:
        if split.recipient_id:
            dr = await db.execute(select(Driver).where(Driver.id == split.recipient_id))
            driver = dr.scalar_one_or_none()
            br = await db.execute(select(Booking).where(Booking.id == split.booking_id))
            b = br.scalar_one_or_none()
            if driver and driver.phone:
                from app.services.sms_service import notify_driver_payout_flagged
                await notify_driver_payout_flagged(db, driver.phone, {
                    "driver_name": driver.name, "amount": f"{float(split.amount):.2f}",
                    "route": f"{b.pickup_name} → {b.dropoff_name}" if b else "", "booking_number": b.booking_number if b else "",
                })
                await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] Driver payout flagged SMS failed: {e}")

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

    # SMS to driver
    try:
        if split.recipient_id:
            dr = await db.execute(select(Driver).where(Driver.id == split.recipient_id))
            driver = dr.scalar_one_or_none()
            br = await db.execute(select(Booking).where(Booking.id == split.booking_id))
            b = br.scalar_one_or_none()
            if driver and driver.phone:
                from app.services.sms_service import notify_driver_payout_rejected
                await notify_driver_payout_rejected(db, driver.phone, {
                    "driver_name": driver.name, "amount": f"{float(split.amount):.2f}",
                    "route": f"{b.pickup_name} → {b.dropoff_name}" if b else "", "booking_number": b.booking_number if b else "",
                })
                await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] Driver payout rejected SMS failed: {e}")

    return {"message": "Payout rejected"}


@router.put("/payouts/{split_id}/retry-transfer")
async def retry_transfer(
    split_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin retries a failed Stripe transfer (driver or cashier)."""
    result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.id == split_id,
            PaymentSplit.recipient_type.in_(["driver", "cashier"]),
            PaymentSplit.payout_status == "transfer_failed",
        )
    )
    split = result.scalar_one_or_none()
    if not split:
        raise HTTPException(status_code=404, detail="Failed transfer not found")

    driver = None
    stripe_connect_id = None
    recipient_name = ""
    recipient_phone = ""
    if split.recipient_type == "driver":
        d_result = await db.execute(select(Driver).where(Driver.id == split.recipient_id))
        driver = d_result.scalar_one_or_none()
        if not driver or not driver.stripe_connect_id:
            raise HTTPException(status_code=400, detail="Driver has no Stripe Connect account")
        stripe_connect_id = driver.stripe_connect_id
        recipient_name = driver.name
        recipient_phone = driver.phone
    else:  # cashier
        c_result = await db.execute(select(Cashier).where(Cashier.id == split.recipient_id))
        cashier = c_result.scalar_one_or_none()
        if not cashier or not cashier.stripe_connect_id:
            raise HTTPException(status_code=400, detail="Cashier has no Stripe Connect account")
        stripe_connect_id = cashier.stripe_connect_id
        recipient_name = cashier.name
        recipient_phone = cashier.phone

    try:
        from app.services.connect_service import execute_transfer, get_account_details
        acct_status = await get_account_details(stripe_connect_id)
        if not acct_status.get("charges_enabled") or not acct_status.get("payouts_enabled"):
            raise HTTPException(status_code=400, detail="Stripe account is not fully set up")

        transfer_id = await execute_transfer(db, split, stripe_connect_id)
        split.payout_status = "released"
        split.paid_at = datetime.now(timezone.utc)
        split.review_note = (split.review_note or "") + f" [Retry succeeded]"
        await db.commit()

        # SMS to recipient
        try:
            br = await db.execute(select(Booking).where(Booking.id == split.booking_id))
            b = br.scalar_one_or_none()
            if split.recipient_type == "driver":
                from app.services.sms_service import notify_driver_payout_released
                await notify_driver_payout_released(db, recipient_phone, {
                    "driver_name": recipient_name, "amount": f"{float(split.amount):.2f}",
                    "route": f"{b.pickup_name} → {b.dropoff_name}" if b else "", "booking_number": b.booking_number if b else "",
                })
            await db.commit()
        except Exception:
            pass

        return {"message": "Transfer retry succeeded", "stripe_transfer_id": transfer_id}
    except HTTPException:
        raise
    except Exception as e:
        split.review_note = (split.review_note or "") + f" [Retry failed: {str(e)}]"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Transfer retry failed: {str(e)}")


@router.put("/payouts/{split_id}/mark-manual")
async def mark_manual_payout(
    split_id: str,
    req: PayoutActionRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin marks a failed transfer as manually handled."""
    result = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.id == split_id,
            PaymentSplit.recipient_type.in_(["driver", "cashier"]),
            PaymentSplit.payout_status == "transfer_failed",
        )
    )
    split = result.scalar_one_or_none()
    if not split:
        raise HTTPException(status_code=404, detail="Failed transfer not found")

    split.payout_status = "released"
    split.reviewed_by = admin.id
    split.reviewed_at = datetime.now(timezone.utc)
    split.paid_at = datetime.now(timezone.utc)
    split.review_note = (split.review_note or "") + f" [Manually transferred: {req.note or 'N/A'}]"
    await db.commit()

    # SMS to recipient (driver only — cashier auto gets referral SMS)
    if split.recipient_type == "driver":
        try:
            d_result = await db.execute(select(Driver).where(Driver.id == split.recipient_id))
            driver = d_result.scalar_one_or_none()
            br = await db.execute(select(Booking).where(Booking.id == split.booking_id))
            b = br.scalar_one_or_none()
            if driver and driver.phone:
                from app.services.sms_service import notify_driver_payout_released
                await notify_driver_payout_released(db, driver.phone, {
                    "driver_name": driver.name, "amount": f"{float(split.amount):.2f}",
                    "route": f"{b.pickup_name} → {b.dropoff_name}" if b else "", "booking_number": b.booking_number if b else "",
                })
                await db.commit()
        except Exception:
            pass

    return {"message": "Payout marked as manually transferred"}


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


@router.get("/bookings/{booking_id}")
async def get_booking_detail(booking_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    b = result.scalar_one_or_none()
    if not b: raise HTTPException(status_code=404, detail="Booking not found")
    driver_data = None
    if b.driver_id:
        dr = await db.execute(select(Driver).where(Driver.id == b.driver_id))
        d = dr.scalar_one_or_none()
        if d: driver_data = {"id": str(d.id), "name": d.name, "phone": d.phone, "vehicle_type": d.vehicle_type, "vehicle_make": d.vehicle_make, "vehicle_plate": d.vehicle_plate, "vehicle_color": d.vehicle_color}
    hotel_name = cashier_name = None
    if b.hotel_id: hotel_name = (await db.execute(select(Hotel.name).where(Hotel.id == b.hotel_id))).scalar_one_or_none()
    if b.cashier_id: cashier_name = (await db.execute(select(Cashier.name).where(Cashier.id == b.cashier_id))).scalar_one_or_none()
    from app.models.rating import Rating as RatingModel
    rating_obj = (await db.execute(select(RatingModel).where(RatingModel.booking_id == b.id))).scalar_one_or_none()
    splits = [{"type": s.recipient_type, "amount": float(s.amount), "status": s.payout_status} for s in (await db.execute(select(PaymentSplit).where(PaymentSplit.booking_id == b.id))).scalars().all()]
    return {
        "id": str(b.id), "booking_number": b.booking_number, "client_name": b.client_name, "client_phone": b.client_phone, "client_room": b.client_room,
        "pickup_name": b.pickup_name, "pickup_address": b.pickup_address, "dropoff_name": b.dropoff_name, "dropoff_address": b.dropoff_address,
        "distance_miles": float(b.distance_miles) if b.distance_miles else None, "pickup_date": str(b.pickup_date), "pickup_time": str(b.pickup_time),
        "vehicle_type": b.vehicle_type, "extras_chosen": b.extras_chosen,
        "base_amount": float(b.base_amount), "extras_amount": float(b.extras_amount), "upsale_amount": float(b.upsale_amount), "total_amount": float(b.total_amount),
        "status": b.status, "created_at": b.created_at.isoformat() if b.created_at else None, "paid_at": b.paid_at.isoformat() if b.paid_at else None,
        "assigned_at": b.assigned_at.isoformat() if b.assigned_at else None, "started_at": b.started_at.isoformat() if b.started_at else None,
        "completed_at": b.completed_at.isoformat() if b.completed_at else None,
        "start_location": b.start_location, "end_location": b.end_location,
        "driver": driver_data, "hotel_name": hotel_name, "cashier_name": cashier_name, "splits": splits,
        "rating": rating_obj.rating if rating_obj else None, "comment": rating_obj.comment if rating_obj else None,
    }


@router.get("/reviews")
async def list_reviews(page: int = Query(1, ge=1), per_page: int = Query(10, ge=1, le=100), admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from app.models.rating import Rating as RatingModel
    total = (await db.execute(select(func.count(RatingModel.id)).where(RatingModel.comment.isnot(None), RatingModel.comment != ""))).scalar()
    result = await db.execute(select(RatingModel).where(RatingModel.comment.isnot(None), RatingModel.comment != "").order_by(RatingModel.created_at.desc()).offset((page - 1) * per_page).limit(per_page))
    reviews = []
    for r in result.scalars().all():
        b = (await db.execute(select(Booking).where(Booking.id == r.booking_id))).scalar_one_or_none()
        driver_name = (await db.execute(select(Driver.name).where(Driver.id == r.driver_id))).scalar_one_or_none()
        reviews.append({"id": str(r.id), "booking_id": str(r.booking_id), "booking_number": b.booking_number if b else None,
            "client_name": b.client_name if b else None, "route": f"{b.pickup_name} → {b.dropoff_name}" if b else None,
            "driver_name": driver_name, "rating": r.rating, "comment": r.comment, "created_at": r.created_at.isoformat() if r.created_at else None})
    return {"items": reviews, "total": total, "page": page, "per_page": per_page, "total_pages": (total + per_page - 1) // per_page}


# ═══════════════════════════════════════════
# DRIVERS
# ═══════════════════════════════════════════

@router.post("/drivers")
async def create_driver(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    name: str = Query(...), phone: str = Query(...), email: str = Query(""),
    vehicle_type: str = Query(...), vehicle_make: str = Query(""), vehicle_plate: str = Query(""),
    vehicle_color: str = Query(""), license_number: str = Query(""),
    has_insurance: bool = Query(False), pay_percentage: float = Query(0),
    payout_method: str = Query("bank"),
):
    """Admin creates a driver — active immediately. Default password = last 4 digits of phone."""
    existing = await db.execute(select(Driver).where(Driver.phone == phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already registered")

    digits = ''.join(c for c in phone if c.isdigit())
    default_password = digits[-4:] if len(digits) >= 4 else digits or "0000"

    default_pct = float(await get_setting_value(db, "default_driver_pay_pct", 70))
    driver = Driver(
        name=name, phone=phone, email=email or None,
        password_hash=hash_password(default_password),
        vehicle_type=vehicle_type, vehicle_make=vehicle_make or None,
        vehicle_plate=vehicle_plate or None, vehicle_color=vehicle_color or None,
        license_number=license_number or None, has_insurance=has_insurance,
        pay_percentage=pay_percentage or default_pct,
        payout_method=payout_method,
        password_changed=False,
        status="active",
        approved_at=datetime.now(timezone.utc),
        approved_by=admin.id,
    )
    db.add(driver)
    await db.commit()
    return {"message": f"Driver {name} created", "id": str(driver.id), "default_password": default_password}


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
            "priority_level": d.priority_level or 2,
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
            "priority_level": driver.priority_level or 2,
            "status": driver.status,
            "rejection_reason": driver.rejection_reason,
            "password_changed": driver.password_changed,
            "default_password": ''.join(c for c in driver.phone if c.isdigit())[-4:],
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
    permanent: bool = Query(False),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    if permanent:
        await db.delete(driver)
        await db.commit()
        return {"message": f"Driver {driver.name} permanently deleted"}
    driver.status = "inactive"
    await db.commit()
    return {"message": f"Driver {driver.name} deactivated"}


@router.put("/drivers/{driver_id}/reset-password")
async def reset_driver_password(
    driver_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin resets driver password back to default (last 4 digits of phone)."""
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    digits = ''.join(c for c in driver.phone if c.isdigit())
    default_password = digits[-4:] if len(digits) >= 4 else digits or "0000"
    driver.password_hash = hash_password(default_password)
    driver.password_changed = False
    await db.commit()
    return {"message": f"Password reset for {driver.name}", "default_password": default_password}


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
            "concierge_id": str(h.concierge_id) if h.concierge_id else None,
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
    permanent: bool = Query(False),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Cashier).where(Cashier.id == cashier_id))
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Cashier not found")
    if permanent:
        await db.delete(cashier)
        await db.commit()
        return {"message": f"Cashier {cashier.name} permanently deleted"}
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
    from app.utils.urls import get_client_base_url
    client_base = await get_client_base_url(db)
    qr_base64 = generate_cashier_qr(
        ref_code=cashier.ref_code,
        cashier_name=cashier.name,
        hotel_name=hotel_name,
        company_name=company_name,
        base_url=client_base,
    )

    return {
        "qr_image": qr_base64,
        "ref_code": cashier.ref_code,
        "cashier_name": cashier.name,
        "hotel_name": hotel_name,
        "company_name": company_name,
        "company_phone": company_phone,
        "booking_url": f"{client_base}/book?ref={cashier.ref_code}",
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
    upsale.is_active = not upsale.is_active
    await db.commit()
    return {"message": f"Upsale {'activated' if upsale.is_active else 'deactivated'}"}


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
    sort_order: int = Query(0), image_url: str | None = Query(None),
    description: str | None = Query(None),
):
    rate = VehicleRate(
        vehicle_type=vehicle_type.lower().replace(' ', '_'), display_name=display_name,
        base_fare=base_fare, per_mile_rate=per_mile_rate,
        max_passengers=max_passengers, max_luggage=max_luggage, sort_order=sort_order,
        image_url=image_url, description=description,
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
    sort_order: int | None = None, image_url: str | None = None,
    description: str | None = None,
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
    if image_url is not None: rate.image_url = image_url
    if description is not None: rate.description = description
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


SUPER_ADMIN_ONLY_SETTINGS = {"client_base_url", "staff_base_url"}


@router.put("/settings")
async def update_setting(
    req: SettingUpdateRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if req.key in SUPER_ADMIN_ONLY_SETTINGS and admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only the super admin can change this setting")

    result = await db.execute(select(Setting).where(Setting.key == req.key))
    setting = result.scalar_one_or_none()
    if not setting:
        # Auto-create the setting if it doesn't exist (allows new keys like service_areas to be saved)
        setting = Setting(key=req.key, value=req.value, updated_by=admin.id)
        db.add(setting)
    else:
        setting.value = req.value
        setting.updated_by = admin.id
    await db.commit()
    return {"message": f"Setting '{req.key}' updated"}


# ═══════════════════════════════════════════
# CONCIERGES
# ═══════════════════════════════════════════

from pydantic import BaseModel as _BM
from app.models.concierge import Concierge
from app.models.payout_batch import PayoutBatch


class ConciergeCreateRequest(_BM):
    name: str
    phone: str
    email: str | None = None


class ConciergeUpdateRequest(_BM):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    status: str | None = None


@router.get("/concierges")
async def list_concierges(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Concierge).order_by(Concierge.created_at.desc()))
    concierges = result.scalars().all()
    out = []
    for c in concierges:
        # Count hotels and cashiers
        h_r = await db.execute(select(func.count(Hotel.id)).where(Hotel.concierge_id == c.id))
        hotel_count = h_r.scalar() or 0
        hotel_ids_r = await db.execute(select(Hotel.id).where(Hotel.concierge_id == c.id))
        hotel_ids = [h[0] for h in hotel_ids_r.all()]
        cashier_count = 0
        total_owed = 0.0
        if hotel_ids:
            ca_r = await db.execute(select(func.count(Cashier.id)).where(Cashier.hotel_id.in_(hotel_ids)))
            cashier_count = ca_r.scalar() or 0
            # Calculate total owed (pending cashier splits)
            cashier_ids_r = await db.execute(select(Cashier.id).where(Cashier.hotel_id.in_(hotel_ids)))
            cashier_ids = [x[0] for x in cashier_ids_r.all()]
            if cashier_ids:
                owed_r = await db.execute(
                    select(func.coalesce(func.sum(PaymentSplit.amount), 0))
                    .where(
                        PaymentSplit.recipient_type == "cashier",
                        PaymentSplit.recipient_id.in_(cashier_ids),
                        PaymentSplit.payout_status == "pending",
                    )
                )
                total_owed = float(owed_r.scalar() or 0)
        out.append({
            "id": str(c.id), "name": c.name, "phone": c.phone, "email": c.email,
            "status": c.status, "stripe_connect_id": c.stripe_connect_id,
            "total_earnings": float(c.total_earnings or 0),
            "total_paid_out": float(c.total_paid_out or 0),
            "hotel_count": hotel_count, "cashier_count": cashier_count,
            "total_owed": total_owed,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return out


@router.get("/concierges/{concierge_id}")
async def get_concierge(concierge_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Concierge).where(Concierge.id == concierge_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concierge not found")

    # Hotels + cashiers under this concierge
    hotels_r = await db.execute(select(Hotel).where(Hotel.concierge_id == concierge_id))
    hotels = hotels_r.scalars().all()
    hotel_ids = [h.id for h in hotels]
    cashiers = []
    if hotel_ids:
        ca_r = await db.execute(select(Cashier).where(Cashier.hotel_id.in_(hotel_ids)))
        cashiers = ca_r.scalars().all()

    return {
        "id": str(c.id), "name": c.name, "phone": c.phone, "email": c.email,
        "status": c.status, "stripe_connect_id": c.stripe_connect_id,
        "payout_method": c.payout_method, "payout_details": c.payout_details,
        "total_earnings": float(c.total_earnings or 0),
        "total_paid_out": float(c.total_paid_out or 0),
        "hotels": [{"id": str(h.id), "name": h.name, "address": h.address} for h in hotels],
        "cashiers": [{"id": str(ca.id), "name": ca.name, "phone": ca.phone, "hotel_id": str(ca.hotel_id) if ca.hotel_id else None} for ca in cashiers],
    }


@router.post("/concierges")
async def create_concierge(req: ConciergeCreateRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    default_pw = req.phone[-4:] if len(req.phone) >= 4 else "0000"
    concierge = Concierge(
        name=req.name, phone=req.phone, email=req.email,
        password_hash=hash_password(default_pw),
        status="active",
    )
    db.add(concierge)
    await db.commit()
    await db.refresh(concierge)
    return {"id": str(concierge.id), "default_password": default_pw}


@router.put("/concierges/{concierge_id}")
async def update_concierge(concierge_id: str, req: ConciergeUpdateRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Concierge).where(Concierge.id == concierge_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concierge not found")
    if req.name is not None: c.name = req.name
    if req.phone is not None: c.phone = req.phone
    if req.email is not None: c.email = req.email
    if req.status is not None: c.status = req.status
    await db.commit()
    return {"message": "Updated"}


@router.delete("/concierges/{concierge_id}")
async def delete_concierge(concierge_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Concierge).where(Concierge.id == concierge_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Concierge not found")
    # Unlink hotels
    await db.execute(select(Hotel).where(Hotel.concierge_id == concierge_id))
    hotels_r = await db.execute(select(Hotel).where(Hotel.concierge_id == concierge_id))
    for h in hotels_r.scalars().all():
        h.concierge_id = None
    await db.delete(c)
    await db.commit()
    return {"message": "Deleted"}


@router.get("/concierges/{concierge_id}/payout-preview")
async def concierge_payout_preview(concierge_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from app.services.payout_batch_service import preview_concierge_payout
    result = await preview_concierge_payout(db, concierge_id)
    return result


class BatchPayoutRequest(_BM):
    split_ids: list[str] | None = None
    release_all: bool = False
    note: str | None = None


@router.post("/concierges/{concierge_id}/payout")
async def execute_concierge_payout(concierge_id: str, req: BatchPayoutRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from app.services.payout_batch_service import preview_concierge_payout, execute_batch_payout

    if req.release_all or not req.split_ids:
        preview = await preview_concierge_payout(db, concierge_id)
        split_ids = preview["split_ids"]
    else:
        split_ids = req.split_ids

    if not split_ids:
        raise HTTPException(status_code=400, detail="No pending commissions to pay out")

    batch = await execute_batch_payout(db, "concierge", concierge_id, split_ids, admin.id, req.note)

    # Always generate public batch view link (for both Stripe and manual settlements)
    batch_url = None
    if batch.status in ("released", "manual"):
        from app.utils.security import create_access_token
        from datetime import timedelta
        batch_token = create_access_token(
            {"sub": str(batch.id), "role": "concierge_batch_view"},
            expires_delta=timedelta(days=30),
        )
        from app.utils.urls import get_staff_base_url
        batch_url = f"{await get_staff_base_url(db)}/concierge-batch?token={batch_token}"

    # SMS notifications (for both Stripe success and manual settlements)
    if batch.status in ("released", "manual"):
        try:
            cr = await db.execute(select(Concierge).where(Concierge.id == concierge_id))
            concierge = cr.scalar_one_or_none()
            if concierge and concierge.phone:
                from app.services.sms_service import notify_concierge_payout, notify_cashier_paid_via_concierge, notify_concierge_batch_link

                paid_date = batch.released_at.strftime("%Y-%m-%d") if batch.released_at else datetime.now(timezone.utc).strftime("%Y-%m-%d")

                await notify_concierge_payout(db, concierge.phone, {
                    "concierge_name": concierge.name,
                    "amount": f"{float(batch.total_amount):.2f}",
                    "count": str(batch.split_count),
                })

                # SMS with link to full breakdown
                await notify_concierge_batch_link(db, concierge.phone, {
                    "concierge_name": concierge.name,
                    "amount": f"{float(batch.total_amount):.2f}",
                    "date": paid_date,
                    "url": batch_url,
                })

                # SMS each affected cashier
                splits_r = await db.execute(select(PaymentSplit).where(PaymentSplit.payout_batch_id == batch.id))
                affected_splits = splits_r.scalars().all()
                cashier_totals = {}
                for s in affected_splits:
                    if s.recipient_id not in cashier_totals:
                        cashier_totals[s.recipient_id] = {"total": 0, "count": 0}
                    cashier_totals[s.recipient_id]["total"] += float(s.amount)
                    cashier_totals[s.recipient_id]["count"] += 1

                for cashier_id, data in cashier_totals.items():
                    cr2 = await db.execute(select(Cashier).where(Cashier.id == cashier_id))
                    cashier = cr2.scalar_one_or_none()
                    if cashier and cashier.phone:
                        await notify_cashier_paid_via_concierge(db, cashier.phone, {
                            "cashier_name": cashier.name,
                            "amount": f"{data['total']:.2f}",
                            "count": str(data["count"]),
                            "concierge_name": concierge.name,
                        })

                # Update concierge totals
                concierge.total_paid_out = float(concierge.total_paid_out or 0) + float(batch.total_amount)
                await db.commit()
        except Exception as e:
            print(f"[SMS ERROR] Concierge payout SMS: {e}")

    return {
        "batch_id": str(batch.id),
        "status": batch.status,
        "total_amount": float(batch.total_amount),
        "split_count": batch.split_count,
        "stripe_transfer_id": batch.stripe_transfer_id,
        "failure_reason": batch.failure_reason,
        "receipt_url": batch_url,
    }


# ═══════════════════════════════════════════
# CONCIERGE STRIPE CONNECT
# ═══════════════════════════════════════════

@router.post("/concierges/{concierge_id}/generate-onboarding-link")
async def generate_concierge_onboarding_link(concierge_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Generate a public onboarding link the admin can send to the concierge."""
    from app.utils.security import create_access_token
    from datetime import timedelta

    r = await db.execute(select(Concierge).where(Concierge.id == concierge_id))
    concierge = r.scalar_one_or_none()
    if not concierge:
        raise HTTPException(status_code=404, detail="Concierge not found")

    # Create a long-lived token (7 days) specifically for onboarding
    token = create_access_token({"sub": str(concierge.id), "role": "concierge_onboarding"}, expires_delta=timedelta(days=7))
    from app.utils.urls import get_staff_base_url
    link = f"{await get_staff_base_url(db)}/concierge-onboarding?token={token}"
    return {"link": link, "expires_in_days": 7}


@router.post("/concierges/{concierge_id}/stripe-connect")
async def concierge_stripe_connect(concierge_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Start Stripe Connect onboarding for a concierge (admin triggers on behalf)."""
    return await _start_concierge_stripe(concierge_id, db)


async def _start_concierge_stripe(concierge_id: str, db: AsyncSession):
    from app.services.connect_service import create_connect_account, create_onboarding_link, get_account_details

    r = await db.execute(select(Concierge).where(Concierge.id == concierge_id))
    concierge = r.scalar_one_or_none()
    if not concierge:
        raise HTTPException(status_code=404, detail="Concierge not found")

    if not concierge.stripe_connect_id:
        acct_id = await create_connect_account("concierge", concierge.id, concierge.email)
        concierge.stripe_connect_id = acct_id
        concierge.payout_method = "stripe_connect"
        await db.flush()
    else:
        acct_id = concierge.stripe_connect_id

    details = await get_account_details(acct_id)
    if details.get("charges_enabled") and details.get("payouts_enabled"):
        concierge.payout_details = details
        await db.commit()
        return {"already_connected": True, "account_id": acct_id, "details": details}

    from app.utils.urls import get_staff_base_url
    staff_base = await get_staff_base_url(db)
    return_url = f"{staff_base}/concierge-onboarding/complete?concierge_id={concierge_id}"
    refresh_url = f"{staff_base}/concierge-onboarding/refresh?concierge_id={concierge_id}"
    url = await create_onboarding_link(acct_id, return_url, refresh_url)

    await db.commit()
    return {"onboarding_url": url, "account_id": acct_id}


@router.get("/concierges/{concierge_id}/stripe-status")
async def concierge_stripe_status(concierge_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from app.services.connect_service import get_account_details
    r = await db.execute(select(Concierge).where(Concierge.id == concierge_id))
    concierge = r.scalar_one_or_none()
    if not concierge:
        raise HTTPException(status_code=404, detail="Concierge not found")
    if not concierge.stripe_connect_id:
        return {"connected": False}

    details = await get_account_details(concierge.stripe_connect_id)
    concierge.payout_details = details
    await db.commit()

    return {
        "connected": True,
        "charges_enabled": details.get("charges_enabled", False),
        "payouts_enabled": details.get("payouts_enabled", False),
        "account_id": concierge.stripe_connect_id,
        "name": details.get("name"),
        "email": details.get("email"),
        "bank_last4": details.get("bank_last4"),
        "bank_name": details.get("bank_name"),
    }


# ═══════════════════════════════════════════
# DRIVER BATCH PAYOUT
# ═══════════════════════════════════════════

@router.get("/drivers/{driver_id}/payout-preview")
async def driver_payout_preview(driver_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from app.services.payout_batch_service import preview_driver_payout
    return await preview_driver_payout(db, driver_id)


@router.post("/drivers/{driver_id}/payout")
async def execute_driver_payout(driver_id: str, req: BatchPayoutRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from app.services.payout_batch_service import preview_driver_payout, execute_batch_payout

    if req.release_all or not req.split_ids:
        preview = await preview_driver_payout(db, driver_id)
        split_ids = preview["split_ids"]
    else:
        split_ids = req.split_ids

    if not split_ids:
        raise HTTPException(status_code=400, detail="No pending rides to pay out")

    batch = await execute_batch_payout(db, "driver", driver_id, split_ids, admin.id, req.note)

    # SMS to driver
    if batch.status == "released":
        try:
            dr = await db.execute(select(Driver).where(Driver.id == driver_id))
            driver = dr.scalar_one_or_none()
            if driver and driver.phone:
                from app.services.sms_service import notify_driver_batch_payout
                await notify_driver_batch_payout(db, driver.phone, {
                    "driver_name": driver.name,
                    "amount": f"{float(batch.total_amount):.2f}",
                    "count": str(batch.split_count),
                })
                driver.total_earnings = float(driver.total_earnings or 0) + float(batch.total_amount)
                await db.commit()
        except Exception as e:
            print(f"[SMS ERROR] Driver batch payout SMS: {e}")

    return {
        "batch_id": str(batch.id),
        "status": batch.status,
        "total_amount": float(batch.total_amount),
        "split_count": batch.split_count,
        "stripe_transfer_id": batch.stripe_transfer_id,
        "failure_reason": batch.failure_reason,
    }


# ═══════════════════════════════════════════
# PAYOUT BATCHES (audit)
# ═══════════════════════════════════════════

@router.get("/payout-batches/{batch_id}")
async def get_payout_batch_detail(batch_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Full detail of a payout batch including all constituent splits."""
    from app.services.payout_batch_service import get_batch_detail
    from app.utils.security import create_access_token
    from datetime import timedelta

    detail = await get_batch_detail(db, batch_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Generate a fresh receipt URL for concierge batches (for admin to copy/share)
    if detail["batch"]["recipient_type"] == "concierge" and detail["batch"]["status"] in ("released", "manual"):
        token = create_access_token(
            {"sub": batch_id, "role": "concierge_batch_view"},
            expires_delta=timedelta(days=30),
        )
        from app.utils.urls import get_staff_base_url
        detail["batch"]["receipt_url"] = f"{await get_staff_base_url(db)}/concierge-batch?token={token}"

    return detail


@router.get("/concierges/{concierge_id}/batches")
async def get_concierge_batches(concierge_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """List past payout batches for a concierge."""
    r = await db.execute(
        select(PayoutBatch).where(
            PayoutBatch.recipient_type == "concierge",
            PayoutBatch.recipient_id == concierge_id,
        ).order_by(PayoutBatch.created_at.desc()).limit(50)
    )
    out = []
    for b in r.scalars().all():
        out.append({
            "id": str(b.id),
            "total_amount": float(b.total_amount),
            "split_count": b.split_count,
            "status": b.status,
            "stripe_transfer_id": b.stripe_transfer_id,
            "failure_reason": b.failure_reason,
            "period_start": b.period_start.isoformat() if b.period_start else None,
            "period_end": b.period_end.isoformat() if b.period_end else None,
            "released_at": b.released_at.isoformat() if b.released_at else None,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        })
    return out


@router.get("/payout-batches")
async def list_payout_batches(
    status: str | None = Query(None),
    recipient_type: str | None = Query(None),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(PayoutBatch)
    conditions = []
    if status:
        conditions.append(PayoutBatch.status == status)
    if recipient_type:
        conditions.append(PayoutBatch.recipient_type == recipient_type)
    if conditions:
        query = query.where(and_(*conditions))
    query = query.order_by(PayoutBatch.created_at.desc()).limit(100)

    r = await db.execute(query)
    batches = r.scalars().all()
    out = []
    for b in batches:
        recipient_name = "—"
        if b.recipient_type == "driver":
            dr = await db.execute(select(Driver.name).where(Driver.id == b.recipient_id))
            recipient_name = dr.scalar_one_or_none() or "Unknown"
        elif b.recipient_type == "concierge":
            cr = await db.execute(select(Concierge.name).where(Concierge.id == b.recipient_id))
            recipient_name = cr.scalar_one_or_none() or "Unknown"

        out.append({
            "id": str(b.id),
            "recipient_type": b.recipient_type,
            "recipient_id": str(b.recipient_id),
            "recipient_name": recipient_name,
            "total_amount": float(b.total_amount),
            "split_count": b.split_count,
            "status": b.status,
            "stripe_transfer_id": b.stripe_transfer_id,
            "failure_reason": b.failure_reason,
            "period_start": b.period_start.isoformat() if b.period_start else None,
            "period_end": b.period_end.isoformat() if b.period_end else None,
            "released_at": b.released_at.isoformat() if b.released_at else None,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        })
    return out


@router.post("/payout-batches/{batch_id}/retry")
async def retry_batch(batch_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(PayoutBatch).where(PayoutBatch.id == batch_id))
    batch = r.scalar_one_or_none()
    if not batch or batch.status != "transfer_failed":
        raise HTTPException(status_code=400, detail="Batch not found or not in failed state")

    # Get the splits
    splits_r = await db.execute(select(PaymentSplit).where(PaymentSplit.payout_batch_id == batch_id))
    splits = splits_r.scalars().all()
    split_ids = [str(s.id) for s in splits]

    # Reset splits to pending so they can be retried
    for s in splits:
        s.payout_status = "pending" if batch.recipient_type == "concierge" else "pending_review"
        s.payout_batch_id = None
    await db.commit()

    # Delete old batch and create new one
    await db.delete(batch)
    await db.commit()

    from app.services.payout_batch_service import execute_batch_payout
    new_batch = await execute_batch_payout(db, batch.recipient_type, batch.recipient_id, split_ids, admin.id)

    return {"batch_id": str(new_batch.id), "status": new_batch.status, "stripe_transfer_id": new_batch.stripe_transfer_id, "failure_reason": new_batch.failure_reason}


@router.post("/payout-batches/{batch_id}/mark-manual")
async def mark_batch_manual(batch_id: str, req: BatchPayoutRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(PayoutBatch).where(PayoutBatch.id == batch_id))
    batch = r.scalar_one_or_none()
    if not batch or batch.status != "transfer_failed":
        raise HTTPException(status_code=400, detail="Batch not found or not in failed state")

    batch.status = "manual"
    batch.released_at = datetime.now(timezone.utc)
    batch.note = (batch.note or "") + f" [Manual: {req.note or 'N/A'}]"

    # Mark all splits as released
    splits_r = await db.execute(select(PaymentSplit).where(PaymentSplit.payout_batch_id == batch_id))
    for s in splits_r.scalars().all():
        s.payout_status = "released"
        s.paid_at = datetime.now(timezone.utc)

    await db.commit()
    return {"message": "Marked as manually paid"}


# ═══════════════════════════════════════════
# DRIVERS WITH PENDING PAYOUTS
# ═══════════════════════════════════════════

@router.get("/drivers-with-pending")
async def drivers_with_pending(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """List all drivers who have completed-but-unreleased splits (pending_review only).
    Excludes 'pending' which is set at payment time before the ride is even started."""
    r = await db.execute(
        select(
            PaymentSplit.recipient_id,
            func.count(PaymentSplit.id).label("ride_count"),
            func.sum(PaymentSplit.amount).label("total"),
        )
        .where(
            PaymentSplit.recipient_type == "driver",
            PaymentSplit.payout_status == "pending_review",
        )
        .group_by(PaymentSplit.recipient_id)
    )
    rows = r.all()

    drivers_out = []
    for row in rows:
        if not row[0]:
            continue
        dr = await db.execute(select(Driver).where(Driver.id == row[0]))
        driver = dr.scalar_one_or_none()
        if driver:
            drivers_out.append({
                "driver_id": str(driver.id),
                "name": driver.name,
                "phone": driver.phone,
                "stripe_connected": bool(driver.stripe_connect_id),
                "ride_count": row[1],
                "total_owed": float(row[2] or 0),
            })

    return sorted(drivers_out, key=lambda x: -x["total_owed"])


# ═══════════════════════════════════════════
# DRIVER PRIORITY + ASSIGNMENT
# ═══════════════════════════════════════════

class SetPriorityRequest(_BM):
    priority_level: int  # 1, 2, or 3


@router.patch("/drivers/{driver_id}/priority")
async def set_driver_priority(driver_id: str, req: SetPriorityRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    if req.priority_level not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="priority_level must be 1 (High), 2 (Normal), or 3 (Low)")
    r = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = r.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    driver.priority_level = req.priority_level
    await db.commit()
    return {"message": "Priority updated", "priority_level": driver.priority_level}


@router.get("/eligible-drivers")
async def get_eligible_drivers(booking_id: str = Query(...), admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Return drivers eligible for a booking (matching vehicle type, active, under max runs)."""
    b_r = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = b_r.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    max_r = await db.execute(select(Setting).where(Setting.key == "max_active_runs_per_driver"))
    max_setting = max_r.scalar_one_or_none()
    max_runs = int(max_setting.value) if max_setting else 5

    drivers_r = await db.execute(
        select(Driver).where(
            Driver.vehicle_type == booking.vehicle_type,
            Driver.status == "active",
        )
    )
    drivers = drivers_r.scalars().all()

    out = []
    for d in drivers:
        count_r = await db.execute(
            select(func.count()).select_from(Booking).where(
                Booking.driver_id == d.id,
                Booking.status.in_(["assigned", "in_progress"]),
            )
        )
        active_count = count_r.scalar() or 0
        out.append({
            "id": str(d.id),
            "name": d.name,
            "phone": d.phone,
            "vehicle_type": d.vehicle_type,
            "vehicle_make": d.vehicle_make,
            "vehicle_plate": d.vehicle_plate,
            "priority_level": d.priority_level or 2,
            "pay_percentage": float(d.pay_percentage),
            "rating_avg": float(d.rating_avg or 0),
            "active_run_count": active_count,
            "is_at_capacity": active_count >= max_runs,
            "is_current_driver": booking.driver_id == d.id,
        })

    # Sort by priority (asc = high first), then by active count (asc = least busy first)
    out.sort(key=lambda x: (x["priority_level"], x["active_run_count"]))
    return {"drivers": out, "max_runs": max_runs, "current_driver_id": str(booking.driver_id) if booking.driver_id else None}


async def _assign_driver_to_booking(db, booking: Booking, driver: Driver):
    """Shared: assign a driver to a booking, update/recalc driver + company PaymentSplit."""
    from datetime import datetime, timezone
    booking.driver_id = driver.id
    booking.status = "assigned"
    booking.assigned_at = datetime.now(timezone.utc)

    # Recalculate driver split
    driver_split_r = await db.execute(
        select(PaymentSplit).where(
            PaymentSplit.booking_id == booking.id,
            PaymentSplit.recipient_type == "driver",
        )
    )
    driver_split = driver_split_r.scalar_one_or_none()

    if driver_split:
        driver_pct = float(driver.pay_percentage) / 100
        driver_split.recipient_id = driver.id
        driver_split.amount = round(float(booking.base_amount) * driver_pct, 2)
        driver_split.percentage = float(driver.pay_percentage)
        driver_split.payout_status = "pending_review" if booking.status == "completed" else "pending"

        # Recalculate company split
        co_r = await db.execute(
            select(PaymentSplit).where(
                PaymentSplit.booking_id == booking.id,
                PaymentSplit.recipient_type == "company",
            )
        )
        company_split = co_r.scalar_one_or_none()
        if company_split:
            ca_r = await db.execute(
                select(PaymentSplit).where(
                    PaymentSplit.booking_id == booking.id,
                    PaymentSplit.recipient_type == "cashier",
                )
            )
            cashier_split = ca_r.scalar_one_or_none()
            cashier_amount = float(cashier_split.amount) if cashier_split else 0
            company_split.amount = round(float(booking.total_amount) - cashier_amount - float(driver_split.amount), 2)


class AssignDriverRequest(_BM):
    driver_id: str


@router.post("/bookings/{booking_id}/assign-driver")
async def assign_driver(booking_id: str, req: AssignDriverRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Admin assigns a driver to an unassigned, paid booking."""
    b_r = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = b_r.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.driver_id is not None:
        raise HTTPException(status_code=400, detail="Booking already has a driver. Use reassign instead.")
    if booking.status != "paid":
        raise HTTPException(status_code=400, detail=f"Booking status is '{booking.status}', must be 'paid'")

    d_r = await db.execute(select(Driver).where(Driver.id == req.driver_id))
    driver = d_r.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    if driver.status != "active":
        raise HTTPException(status_code=400, detail="Driver is not active")
    if driver.vehicle_type != booking.vehicle_type:
        raise HTTPException(status_code=400, detail=f"Driver vehicle ({driver.vehicle_type}) doesn't match booking ({booking.vehicle_type})")

    # Check max runs
    max_r = await db.execute(select(Setting).where(Setting.key == "max_active_runs_per_driver"))
    max_setting = max_r.scalar_one_or_none()
    max_runs = int(max_setting.value) if max_setting else 5
    count_r = await db.execute(
        select(func.count()).select_from(Booking).where(
            Booking.driver_id == driver.id,
            Booking.status.in_(["assigned", "in_progress"]),
        )
    )
    if (count_r.scalar() or 0) >= max_runs:
        raise HTTPException(status_code=400, detail=f"Driver is at capacity ({max_runs} active runs)")

    await _assign_driver_to_booking(db, booking, driver)
    await db.commit()

    # SMS
    try:
        from app.services.sms_service import notify_driver_new_run
        driver_earn = round(float(booking.base_amount) * float(driver.pay_percentage) / 100, 2)
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
        print(f"[SMS ERROR] Assign driver SMS: {e}")

    return {"message": "Driver assigned", "driver_name": driver.name, "booking_number": booking.booking_number}


class ReassignDriverRequest(_BM):
    new_driver_id: str
    reason: str | None = None


@router.post("/bookings/{booking_id}/reassign-driver")
async def reassign_driver(booking_id: str, req: ReassignDriverRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Admin reassigns a booking from one driver to another."""
    b_r = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = b_r.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status not in ("assigned", "in_progress"):
        raise HTTPException(status_code=400, detail=f"Booking status is '{booking.status}', must be 'assigned' or 'in_progress'")
    if booking.driver_id is None:
        raise HTTPException(status_code=400, detail="Booking has no current driver. Use assign instead.")
    if str(booking.driver_id) == req.new_driver_id:
        raise HTTPException(status_code=400, detail="New driver is same as current driver")

    # Capture old driver
    old_d_r = await db.execute(select(Driver).where(Driver.id == booking.driver_id))
    old_driver = old_d_r.scalar_one_or_none()

    # Validate new driver
    new_d_r = await db.execute(select(Driver).where(Driver.id == req.new_driver_id))
    new_driver = new_d_r.scalar_one_or_none()
    if not new_driver:
        raise HTTPException(status_code=404, detail="New driver not found")
    if new_driver.status != "active":
        raise HTTPException(status_code=400, detail="New driver is not active")
    if new_driver.vehicle_type != booking.vehicle_type:
        raise HTTPException(status_code=400, detail="New driver's vehicle type doesn't match booking")

    # If was in_progress, reset started_at
    was_in_progress = booking.status == "in_progress"
    if was_in_progress:
        booking.started_at = None
        booking.start_location = None

    await _assign_driver_to_booking(db, booking, new_driver)
    await db.commit()

    # SMS to old driver
    try:
        from app.services.sms_service import notify_driver_run_cancelled
        if old_driver and old_driver.phone:
            await notify_driver_run_cancelled(db, old_driver.phone, {
                "driver_name": old_driver.name,
                "pickup_name": booking.pickup_name,
                "dropoff_name": booking.dropoff_name,
                "pickup_date": str(booking.pickup_date),
                "pickup_time": str(booking.pickup_time)[:5],
                "reason": req.reason or "Admin reassignment",
                "booking_number": booking.booking_number,
            })
            await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] Old driver cancel SMS: {e}")

    # SMS to new driver
    try:
        from app.services.sms_service import notify_driver_new_run
        driver_earn = round(float(booking.base_amount) * float(new_driver.pay_percentage) / 100, 2)
        await notify_driver_new_run(db, new_driver.phone, {
            "driver_name": new_driver.name,
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
        print(f"[SMS ERROR] New driver assign SMS: {e}")

    return {
        "message": "Driver reassigned",
        "old_driver_name": old_driver.name if old_driver else None,
        "new_driver_name": new_driver.name,
        "booking_number": booking.booking_number,
    }


# ═══════════════════════════════════════════
# REFUNDS
# ═══════════════════════════════════════════

class RefundRequest(_BM):
    reason: str
    amount: float | None = None  # null = full refund


@router.post("/bookings/{booking_id}/refund")
async def refund_booking(booking_id: str, req: RefundRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Admin refunds a paid booking. Executes Stripe refund and cancels the booking."""
    b_r = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = b_r.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status not in ("paid", "assigned", "in_progress", "completed"):
        raise HTTPException(status_code=400, detail=f"Cannot refund booking with status '{booking.status}'")

    # Get the payment
    p_r = await db.execute(select(Payment).where(Payment.booking_id == booking.id).order_by(Payment.created_at.desc()))
    payment = p_r.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=400, detail="No payment found for this booking")
    if payment.status == "refunded":
        raise HTTPException(status_code=400, detail="This payment has already been refunded")

    refund_amount = req.amount if req.amount is not None else float(payment.amount)
    if refund_amount <= 0 or refund_amount > float(payment.amount):
        raise HTTPException(status_code=400, detail="Invalid refund amount")

    # Execute Stripe refund
    from app.services.payment_service import is_dev_mode
    stripe_refund_id = None
    if is_dev_mode() or not payment.stripe_payment_id:
        stripe_refund_id = f"re_dev_{str(payment.id)[:8]}"
        print(f"[STRIPE DEV] Refund {stripe_refund_id}: ${refund_amount} for payment {payment.stripe_payment_id}")
    else:
        try:
            import stripe
            from app.config import settings as cfg
            stripe.api_key = cfg.STRIPE_SECRET_KEY
            refund = stripe.Refund.create(
                payment_intent=payment.stripe_payment_id,
                amount=int(refund_amount * 100),
                reason="requested_by_customer",
                metadata={"booking_number": booking.booking_number, "admin_note": req.reason[:500]},
            )
            stripe_refund_id = refund.id
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Stripe refund failed: {str(e)}")

    # Update payment
    payment.status = "refunded" if refund_amount >= float(payment.amount) else "partially_refunded"
    payment.refund_amount = refund_amount
    payment.refund_reason = req.reason
    payment.stripe_refund_id = stripe_refund_id
    payment.refunded_at = datetime.now(timezone.utc)
    payment.refunded_by = admin.id

    # Cancel booking
    booking.status = "cancelled"

    # Cancel all pending splits — remove from driver/cashier income
    splits_r = await db.execute(select(PaymentSplit).where(PaymentSplit.booking_id == booking.id))
    for s in splits_r.scalars().all():
        if s.payout_status in ("pending", "pending_review"):
            s.payout_status = "cancelled"
            s.review_note = (s.review_note or "") + f" [Refunded: {req.reason[:100]}]"

    await db.commit()

    # SMS to client
    try:
        from app.services.sms_service import notify_client_refund
        await notify_client_refund(db, booking.client_phone, {
            "client_name": booking.client_name,
            "amount": f"{refund_amount:.2f}",
            "reason": req.reason,
            "booking_number": booking.booking_number,
        })
        await db.commit()
    except Exception as e:
        print(f"[SMS ERROR] Refund SMS: {e}")

    return {
        "message": "Booking refunded",
        "stripe_refund_id": stripe_refund_id,
        "refund_amount": refund_amount,
        "booking_status": booking.status,
    }


# ═══════════════════════════════════════════
# ADMIN SELF-SERVICE
# ═══════════════════════════════════════════

@router.get("/me")
async def get_admin_me(admin: Admin = Depends(get_current_admin)):
    return {
        "id": str(admin.id),
        "name": admin.name,
        "email": admin.email,
        "role": admin.role,
        "is_super_admin": admin.role == "super_admin",
        "password_changed": admin.password_changed,
    }


class ChangePasswordRequest(_BM):
    current_password: str
    new_password: str


@router.post("/me/change-password")
async def change_admin_password(
    req: ChangePasswordRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(req.current_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    admin.password_hash = hash_password(req.new_password)
    admin.password_changed = True
    await db.commit()
    return {"message": "Password changed"}


# ═══════════════════════════════════════════
# ADMIN MANAGEMENT (super-admin only)
# ═══════════════════════════════════════════

def _require_super_admin(admin: Admin):
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only the super admin can perform this action")


@router.get("/admins")
async def list_admins(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    _require_super_admin(admin)
    r = await db.execute(select(Admin).order_by(Admin.created_at.desc()))
    return [
        {
            "id": str(a.id),
            "name": a.name,
            "email": a.email,
            "role": a.role,
            "is_super_admin": a.role == "super_admin",
            "is_active": a.is_active,
            "password_changed": a.password_changed,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in r.scalars().all()
    ]


class CreateAdminRequest(_BM):
    name: str
    email: str
    password: str


@router.post("/admins")
async def create_admin(
    req: CreateAdminRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    _require_super_admin(admin)
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = await db.execute(select(Admin).where(Admin.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An admin with that email already exists")

    new_admin = Admin(
        name=req.name,
        email=req.email,
        password_hash=hash_password(req.password),
        role="admin",  # super-admin role is reserved for the seeded account
        password_changed=False,  # force change on first login
    )
    db.add(new_admin)
    await db.commit()
    await db.refresh(new_admin)
    return {
        "id": str(new_admin.id),
        "name": new_admin.name,
        "email": new_admin.email,
        "role": new_admin.role,
        "password_changed": new_admin.password_changed,
    }


class ResetAdminPasswordRequest(_BM):
    new_password: str


@router.post("/admins/{admin_id}/reset-password")
async def reset_admin_password(
    admin_id: str,
    req: ResetAdminPasswordRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    _require_super_admin(admin)
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    target_r = await db.execute(select(Admin).where(Admin.id == admin_id))
    target = target_r.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    target.password_hash = hash_password(req.new_password)
    target.password_changed = False  # so the admin is nudged to change it next login
    await db.commit()
    return {"message": "Password reset. The admin will be asked to change it on next login."}


@router.delete("/admins/{admin_id}")
async def delete_admin(
    admin_id: str,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    _require_super_admin(admin)
    if str(admin.id) == admin_id:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")
    target_r = await db.execute(select(Admin).where(Admin.id == admin_id))
    target = target_r.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    if target.role == "super_admin":
        raise HTTPException(status_code=403, detail="The super admin cannot be deleted")
    await db.delete(target)
    await db.commit()
    return {"message": "Admin deleted"}
