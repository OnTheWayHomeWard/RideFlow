"""
Payment Split Service — calculates how money is divided between cashier, driver, and company.
"""
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.setting import Setting
from app.models.cashier import Cashier
from app.models.driver import Driver
from app.models.payment import Payment
from app.models.payment_split import PaymentSplit


async def get_setting_value(db: AsyncSession, key: str, default=None):
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        return setting.value
    return default


async def create_splits_for_booking(db: AsyncSession, booking: Booking, payment: Payment):
    """
    Create payment split records after payment is confirmed.
    - Cashier split: payout_trigger = on_payment (immediate)
    - Driver split: payout_trigger = on_release (after admin reviews)
    - Company split: payout_trigger = on_release
    """
    total = float(booking.total_amount)
    splits = []

    # 1. Cashier commission (if cashier referral)
    cashier_amount = 0.0
    if booking.cashier_id:
        # Get cashier-specific or hotel-default commission
        cashier_result = await db.execute(select(Cashier).where(Cashier.id == booking.cashier_id))
        cashier = cashier_result.scalar_one_or_none()

        default_pct = await get_setting_value(db, "default_cashier_commission_pct", 10)
        cashier_pct = float(cashier.commission_pct) if cashier and cashier.commission_pct else float(default_pct)

        cashier_amount = round(total * cashier_pct / 100, 2)

        splits.append(PaymentSplit(
            payment_id=payment.id,
            booking_id=booking.id,
            recipient_type="cashier",
            recipient_id=booking.cashier_id,
            amount=cashier_amount,
            percentage=cashier_pct,
            payout_trigger="on_payment",
            payout_status="released",  # cashier paid immediately
        ))

        # Update cashier stats
        if cashier:
            cashier.total_referrals = (cashier.total_referrals or 0) + 1
            cashier.total_earnings = float(cashier.total_earnings or 0) + cashier_amount

            # Execute Stripe Transfer if cashier has connected account
            if cashier.stripe_connect_id:
                try:
                    from app.services.connect_service import execute_transfer, get_account_details
                    acct_status = await get_account_details(cashier.stripe_connect_id)
                    if not acct_status.get("charges_enabled") or not acct_status.get("payouts_enabled"):
                        splits[-1].payout_status = "transfer_failed"
                        splits[-1].review_note = "Stripe account not fully activated"
                        print(f"[STRIPE] Cashier account not activated: charges_enabled={acct_status.get('charges_enabled')}, payouts_enabled={acct_status.get('payouts_enabled')}")
                    else:
                        await execute_transfer(db, splits[-1], cashier.stripe_connect_id)
                        splits[-1].paid_at = datetime.now(timezone.utc)
                except Exception as e:
                    splits[-1].payout_status = "transfer_failed"
                    splits[-1].review_note = f"Stripe transfer failed: {str(e)}"
                    print(f"[STRIPE] Cashier transfer failed: {e}")

            # Send SMS notification to cashier
            from app.services.sms_service import notify_cashier_referral
            await notify_cashier_referral(db, cashier.phone, {
                "cashier_name": cashier.name,
                "amount": f"{cashier_amount:.2f}",
                "client_name": booking.client_name,
                "route": f"{booking.pickup_name} → {booking.dropoff_name}",
                "booking_number": booking.booking_number,
                "total_earnings": f"{float(cashier.total_earnings):.2f}",
            })

    # 2. Driver cut (calculated now, paid after admin releases)
    default_driver_pct = await get_setting_value(db, "default_driver_pay_pct", 70)
    driver_pct = float(default_driver_pct)

    # Check if upsale is included in driver pay
    if booking.upsale_amount and float(booking.upsale_amount) > 0:
        # By default driver does NOT get upsale — calculated on base only
        driver_base = float(booking.base_amount) + float(booking.extras_amount) - cashier_amount
    else:
        driver_base = total - cashier_amount

    driver_amount = round(driver_base * driver_pct / 100, 2)

    splits.append(PaymentSplit(
        payment_id=payment.id,
        booking_id=booking.id,
        recipient_type="driver",
        recipient_id=None,  # driver not assigned yet
        amount=driver_amount,
        percentage=driver_pct,
        payout_trigger="on_release",
        payout_status="pending",
    ))

    # 3. Company gets the rest
    company_amount = round(total - cashier_amount - driver_amount, 2)

    splits.append(PaymentSplit(
        payment_id=payment.id,
        booking_id=booking.id,
        recipient_type="company",
        recipient_id=None,
        amount=company_amount,
        percentage=round(company_amount / total * 100, 2) if total > 0 else 0,
        payout_trigger="on_release",
        payout_status="pending",
    ))

    db.add_all(splits)
    return splits
