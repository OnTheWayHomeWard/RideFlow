"""
Payout Batch Service — handles batched payouts to concierges and drivers.
"""
from datetime import datetime, timezone
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.cashier import Cashier
from app.models.driver import Driver
from app.models.concierge import Concierge
from app.models.hotel import Hotel
from app.models.payment_split import PaymentSplit
from app.models.payout_batch import PayoutBatch


async def preview_concierge_payout(db: AsyncSession, concierge_id, period_start=None, period_end=None):
    """Calculate what a concierge is owed for pending cashier commissions."""
    # Get all hotels under this concierge
    hotels_r = await db.execute(select(Hotel.id).where(Hotel.concierge_id == concierge_id))
    hotel_ids = [h[0] for h in hotels_r.all()]

    if not hotel_ids:
        return {"total": 0, "split_count": 0, "by_hotel": [], "by_cashier": [], "splits": []}

    # Get all cashiers working at these hotels (cashiers link to hotel via hotel_id)
    cashiers_r = await db.execute(select(Cashier).where(Cashier.hotel_id.in_(hotel_ids)))
    cashiers = cashiers_r.scalars().all()
    cashier_ids = [c.id for c in cashiers]
    cashier_map = {c.id: c for c in cashiers}

    if not cashier_ids:
        return {"total": 0, "split_count": 0, "by_hotel": [], "by_cashier": [], "splits": []}

    # Get pending cashier splits
    conditions = [
        PaymentSplit.recipient_type == "cashier",
        PaymentSplit.recipient_id.in_(cashier_ids),
        PaymentSplit.payout_status == "pending",
    ]
    if period_start:
        conditions.append(PaymentSplit.created_at >= period_start)
    if period_end:
        conditions.append(PaymentSplit.created_at <= period_end)

    splits_r = await db.execute(select(PaymentSplit).where(and_(*conditions)).order_by(PaymentSplit.created_at))
    splits = splits_r.scalars().all()

    # Group by hotel and cashier
    hotel_totals = {}
    cashier_totals = {}
    splits_out = []

    for s in splits:
        cashier = cashier_map.get(s.recipient_id)
        if not cashier:
            continue
        amt = float(s.amount)

        # Get booking for hotel info
        b_r = await db.execute(select(Booking).where(Booking.id == s.booking_id))
        booking = b_r.scalar_one_or_none()
        hotel_id = booking.hotel_id if booking else cashier.hotel_id

        if hotel_id not in hotel_totals:
            hotel_totals[hotel_id] = {"hotel_id": str(hotel_id), "total": 0, "count": 0}
        hotel_totals[hotel_id]["total"] += amt
        hotel_totals[hotel_id]["count"] += 1

        if s.recipient_id not in cashier_totals:
            cashier_totals[s.recipient_id] = {
                "cashier_id": str(s.recipient_id),
                "cashier_name": cashier.name,
                "total": 0,
                "count": 0,
            }
        cashier_totals[s.recipient_id]["total"] += amt
        cashier_totals[s.recipient_id]["count"] += 1

        splits_out.append({
            "split_id": str(s.id),
            "booking_number": booking.booking_number if booking else None,
            "route": f"{booking.pickup_name} → {booking.dropoff_name}" if booking else None,
            "cashier_name": cashier.name,
            "amount": amt,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    # Fill in hotel names
    by_hotel = []
    for hid, data in hotel_totals.items():
        if hid:
            hr = await db.execute(select(Hotel.name).where(Hotel.id == hid))
            data["hotel_name"] = hr.scalar_one_or_none() or "Unknown"
        else:
            data["hotel_name"] = "—"
        by_hotel.append(data)

    return {
        "total": sum(h["total"] for h in by_hotel),
        "split_count": len(splits),
        "by_hotel": by_hotel,
        "by_cashier": list(cashier_totals.values()),
        "splits": splits_out,
        "split_ids": [str(s.id) for s in splits],
    }


async def preview_driver_payout(db: AsyncSession, driver_id, period_start=None, period_end=None):
    """Calculate what a driver is owed for completed rides, including client ratings."""
    from app.models.rating import Rating
    conditions = [
        PaymentSplit.recipient_type == "driver",
        PaymentSplit.recipient_id == driver_id,
        # Only completed-but-unreleased rides — exclude 'pending' which is set at payment time.
        PaymentSplit.payout_status == "pending_review",
    ]
    if period_start:
        conditions.append(PaymentSplit.created_at >= period_start)
    if period_end:
        conditions.append(PaymentSplit.created_at <= period_end)

    splits_r = await db.execute(select(PaymentSplit).where(and_(*conditions)).order_by(PaymentSplit.created_at))
    splits = splits_r.scalars().all()

    if not splits:
        return {"total": 0, "split_count": 0, "rides": [], "split_ids": []}

    # Batch fetch bookings
    booking_ids = [s.booking_id for s in splits]
    bookings_r = await db.execute(select(Booking).where(Booking.id.in_(booking_ids)))
    booking_map = {b.id: b for b in bookings_r.scalars().all()}

    # Batch fetch ratings
    ratings_r = await db.execute(select(Rating).where(Rating.booking_id.in_(booking_ids)))
    rating_map = {r.booking_id: r for r in ratings_r.scalars().all()}

    rides = []
    total = 0.0
    for s in splits:
        booking = booking_map.get(s.booking_id)
        if booking:
            rating = rating_map.get(booking.id)
            rides.append({
                "split_id": str(s.id),
                "booking_id": str(booking.id),
                "booking_number": booking.booking_number,
                "route": f"{booking.pickup_name} → {booking.dropoff_name}",
                "pickup_date": str(booking.pickup_date),
                "completed_at": booking.completed_at.isoformat() if booking.completed_at else None,
                "amount": float(s.amount),
                "status": s.payout_status,
                "rating": rating.rating if rating else None,
                "comment": rating.comment if rating else None,
            })
            total += float(s.amount)

    return {
        "total": total,
        "split_count": len(splits),
        "rides": rides,
        "split_ids": [str(s.id) for s in splits],
    }


async def get_batch_detail(db: AsyncSession, batch_id):
    """Full batch detail — used by admin and public concierge receipt."""
    from app.models.rating import Rating
    from app.models.concierge import Concierge

    b_r = await db.execute(select(PayoutBatch).where(PayoutBatch.id == batch_id))
    batch = b_r.scalar_one_or_none()
    if not batch:
        return None

    # Recipient name
    recipient_name = ""
    recipient_phone = ""
    if batch.recipient_type == "driver":
        r = await db.execute(select(Driver).where(Driver.id == batch.recipient_id))
        d = r.scalar_one_or_none()
        if d:
            recipient_name = d.name
            recipient_phone = d.phone
    elif batch.recipient_type == "concierge":
        r = await db.execute(select(Concierge).where(Concierge.id == batch.recipient_id))
        c = r.scalar_one_or_none()
        if c:
            recipient_name = c.name
            recipient_phone = c.phone

    # Get all splits in this batch
    splits_r = await db.execute(
        select(PaymentSplit).where(PaymentSplit.payout_batch_id == batch.id).order_by(PaymentSplit.created_at)
    )
    splits = splits_r.scalars().all()

    booking_ids = [s.booking_id for s in splits]
    bookings_r = await db.execute(select(Booking).where(Booking.id.in_(booking_ids))) if booking_ids else None
    booking_map = {b.id: b for b in bookings_r.scalars().all()} if bookings_r else {}

    # Cashiers (for concierge batches)
    cashier_map = {}
    if batch.recipient_type == "concierge":
        cashier_ids = [s.recipient_id for s in splits if s.recipient_id]
        if cashier_ids:
            ca_r = await db.execute(select(Cashier).where(Cashier.id.in_(cashier_ids)))
            cashier_map = {c.id: c for c in ca_r.scalars().all()}

    # Ratings (for driver batches)
    rating_map = {}
    if batch.recipient_type == "driver" and booking_ids:
        rr = await db.execute(select(Rating).where(Rating.booking_id.in_(booking_ids)))
        rating_map = {r.booking_id: r for r in rr.scalars().all()}

    splits_out = []
    by_cashier = {}
    for s in splits:
        booking = booking_map.get(s.booking_id)
        cashier = cashier_map.get(s.recipient_id) if batch.recipient_type == "concierge" else None
        rating = rating_map.get(s.booking_id) if batch.recipient_type == "driver" else None

        ride_data = {
            "split_id": str(s.id),
            "booking_id": str(s.booking_id) if s.booking_id else None,
            "booking_number": booking.booking_number if booking else None,
            "route": f"{booking.pickup_name} → {booking.dropoff_name}" if booking else None,
            "pickup_date": str(booking.pickup_date) if booking else None,
            "amount": float(s.amount),
            "cashier_id": str(s.recipient_id) if cashier else None,
            "cashier_name": cashier.name if cashier else None,
            "rating": rating.rating if rating else None,
            "comment": rating.comment if rating else None,
        }
        splits_out.append(ride_data)

        if cashier:
            key = str(cashier.id)
            if key not in by_cashier:
                by_cashier[key] = {
                    "cashier_id": key,
                    "cashier_name": cashier.name,
                    "total": 0,
                    "count": 0,
                    "rides": [],
                }
            by_cashier[key]["total"] += float(s.amount)
            by_cashier[key]["count"] += 1
            by_cashier[key]["rides"].append(ride_data)

    return {
        "batch": {
            "id": str(batch.id),
            "recipient_type": batch.recipient_type,
            "recipient_id": str(batch.recipient_id),
            "recipient_name": recipient_name,
            "total_amount": float(batch.total_amount),
            "split_count": batch.split_count,
            "status": batch.status,
            "stripe_transfer_id": batch.stripe_transfer_id,
            "stripe_account_id": batch.stripe_account_id,
            "failure_reason": batch.failure_reason,
            "period_start": batch.period_start.isoformat() if batch.period_start else None,
            "period_end": batch.period_end.isoformat() if batch.period_end else None,
            "released_at": batch.released_at.isoformat() if batch.released_at else None,
            "created_at": batch.created_at.isoformat() if batch.created_at else None,
            "note": batch.note,
        },
        "splits": splits_out,
        "by_cashier": list(by_cashier.values()),
    }


async def execute_batch_payout(
    db: AsyncSession,
    recipient_type: str,  # "driver" or "concierge"
    recipient_id,
    split_ids: list,
    admin_id=None,
    note: str | None = None,
):
    """Execute a batched Stripe transfer for multiple splits."""
    from app.services.connect_service import is_dev_mode
    import stripe
    from app.config import settings

    # Validate splits
    if not split_ids:
        raise ValueError("No splits provided")

    splits_r = await db.execute(select(PaymentSplit).where(PaymentSplit.id.in_(split_ids)))
    splits = splits_r.scalars().all()

    if not splits:
        raise ValueError("No valid splits found")

    # Calculate total
    total = sum(float(s.amount) for s in splits)
    amount_cents = int(total * 100)

    # Get recipient's Stripe account
    stripe_account_id = None
    if recipient_type == "driver":
        r = await db.execute(select(Driver).where(Driver.id == recipient_id))
        driver = r.scalar_one_or_none()
        if not driver:
            raise ValueError("Driver not found")
        stripe_account_id = driver.stripe_connect_id
    elif recipient_type == "concierge":
        r = await db.execute(select(Concierge).where(Concierge.id == recipient_id))
        concierge = r.scalar_one_or_none()
        if not concierge:
            raise ValueError("Concierge not found")
        stripe_account_id = concierge.stripe_connect_id
    else:
        raise ValueError(f"Invalid recipient_type: {recipient_type}")

    # Compute period from splits
    period_start = min(s.created_at for s in splits)
    period_end = max(s.created_at for s in splits)

    # Create batch record
    batch = PayoutBatch(
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        total_amount=total,
        split_count=len(splits),
        status="processing",
        stripe_account_id=stripe_account_id,
        period_start=period_start,
        period_end=period_end,
        released_by=admin_id,
        note=note,
    )
    db.add(batch)
    await db.flush()

    # Attempt Stripe transfer
    transfer_id = None
    if not stripe_account_id:
        batch.status = "manual"
        batch.released_at = datetime.now(timezone.utc)
        batch.failure_reason = "No Stripe account connected — manual payout required"
    elif is_dev_mode():
        transfer_id = f"tr_dev_batch_{str(batch.id)[:8]}"
        print(f"[STRIPE DEV] Batch Transfer {transfer_id}: ${total:.2f} → {stripe_account_id}")
        batch.stripe_transfer_id = transfer_id
        batch.status = "released"
        batch.released_at = datetime.now(timezone.utc)
    else:
        try:
            stripe.api_key = settings.STRIPE_SECRET_KEY
            # Get payout currency from settings
            from app.models.setting import Setting as SettingModel
            cur_r = await db.execute(select(SettingModel).where(SettingModel.key == "payout_currency"))
            cur_setting = cur_r.scalar_one_or_none()
            currency = str(cur_setting.value).lower() if cur_setting else "usd"

            # Check account status
            acct = stripe.Account.retrieve(stripe_account_id)
            if not acct.charges_enabled or not acct.payouts_enabled:
                batch.status = "transfer_failed"
                batch.failure_reason = "Stripe account not fully activated"
            else:
                import time
                idem_key = f"batch_{batch.id}_{int(time.time())}"
                transfer = stripe.Transfer.create(
                    amount=amount_cents,
                    currency=currency,
                    destination=stripe_account_id,
                    metadata={
                        "batch_id": str(batch.id),
                        "recipient_type": recipient_type,
                        "recipient_id": str(recipient_id),
                        "split_count": len(splits),
                    },
                    idempotency_key=idem_key,
                )
                transfer_id = transfer.id
                batch.stripe_transfer_id = transfer_id
                batch.status = "released"
                batch.released_at = datetime.now(timezone.utc)
        except Exception as e:
            batch.status = "transfer_failed"
            # Capture as much Stripe error detail as possible
            error_parts = [str(e)]
            try:
                import stripe as _stripe
                if isinstance(e, _stripe.error.StripeError):
                    if getattr(e, 'code', None):
                        error_parts.append(f"code={e.code}")
                    if getattr(e, 'decline_code', None):
                        error_parts.append(f"decline_code={e.decline_code}")
                    if getattr(e, 'request_id', None):
                        error_parts.append(f"request_id={e.request_id}")
                    if getattr(e, 'http_status', None):
                        error_parts.append(f"http_status={e.http_status}")
                    if getattr(e, 'user_message', None):
                        error_parts.append(f"user_message={e.user_message}")
            except Exception:
                pass
            batch.failure_reason = " | ".join(error_parts)
            print(f"[STRIPE] Transfer failed: {batch.failure_reason}")

    # Update splits
    if batch.status in ("released", "manual"):
        for s in splits:
            s.payout_status = "released"
            s.payout_batch_id = batch.id
            s.stripe_transfer_id = transfer_id
            s.paid_at = datetime.now(timezone.utc)
            s.reviewed_by = admin_id

        # For driver batches, also release company splits for same bookings
        if recipient_type == "driver":
            booking_ids = list({s.booking_id for s in splits})
            co_r = await db.execute(
                select(PaymentSplit).where(
                    PaymentSplit.booking_id.in_(booking_ids),
                    PaymentSplit.recipient_type == "company",
                    PaymentSplit.payout_status != "released",
                )
            )
            for co_split in co_r.scalars().all():
                co_split.payout_status = "released"
                co_split.paid_at = datetime.now(timezone.utc)
    else:
        # transfer_failed — mark splits as transfer_failed but still linked to batch
        for s in splits:
            s.payout_status = "transfer_failed"
            s.payout_batch_id = batch.id

    await db.commit()
    return batch
