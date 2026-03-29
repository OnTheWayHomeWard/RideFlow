"""
Payment Service — handles Stripe integration and dev-mode simulation.

Dev mode: When STRIPE_SECRET_KEY starts with "sk_test_placeholder" or setting
"dev_mode_payments" is true, payments are simulated locally without hitting Stripe.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.payment_split import PaymentSplit
from app.models.setting import Setting
from app.services.split_service import create_splits_for_booking


def is_dev_mode() -> bool:
    """Check if we're in dev/simulation mode."""
    return (
        not settings.STRIPE_SECRET_KEY
        or settings.STRIPE_SECRET_KEY.startswith("sk_test_placeholder")
        or settings.STRIPE_SECRET_KEY == ""
    )


async def create_checkout_session(db: AsyncSession, booking: Booking) -> dict:
    """
    Create a payment session.
    - Production: creates a real Stripe Checkout session
    - Dev mode: returns a simulated checkout URL that auto-confirms
    """
    if is_dev_mode():
        # DEV MODE — simulate payment
        return {
            "checkout_url": f"http://localhost:8000/api/payments/dev-confirm/{booking.booking_number}",
            "session_id": f"dev_session_{booking.booking_number}",
            "mode": "dev_simulation",
        }

    # PRODUCTION — real Stripe
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": int(float(booking.total_amount) * 100),  # cents
                "product_data": {
                    "name": f"Ride: {booking.pickup_name} → {booking.dropoff_name}",
                    "description": f"Booking #{booking.booking_number} • {booking.vehicle_type.upper()} • {booking.passengers} passengers",
                },
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"http://localhost:5173/confirmation/{booking.booking_number}",
        cancel_url=f"http://localhost:5173/booking?cancelled=true",
        metadata={
            "booking_number": booking.booking_number,
            "booking_id": str(booking.id),
        },
    )

    return {
        "checkout_url": session.url,
        "session_id": session.id,
        "mode": "live",
    }


async def confirm_payment(db: AsyncSession, booking: Booking, stripe_payment_id: str | None = None, stripe_session_id: str | None = None):
    """
    Confirm payment — called by Stripe webhook (production) or dev-confirm endpoint (dev mode).
    Creates payment record, splits, and updates booking status.
    """
    # Create payment record
    payment = Payment(
        booking_id=booking.id,
        stripe_payment_id=stripe_payment_id or f"dev_pay_{booking.booking_number}",
        stripe_session_id=stripe_session_id or f"dev_sess_{booking.booking_number}",
        amount=float(booking.total_amount),
        currency="USD",
        status="captured",
    )
    db.add(payment)
    await db.flush()  # get payment.id

    # Create payment splits
    await create_splits_for_booking(db, booking, payment)

    # Update booking status
    booking.status = "paid"
    booking.paid_at = datetime.now(timezone.utc)

    # Send confirmation SMS to client
    from app.services.sms_service import notify_client_booking
    confirmation_url = f"http://localhost:5173/confirmation/{booking.booking_number}"
    await notify_client_booking(db, booking.client_phone, {
        "client_name": booking.client_name,
        "pickup_name": booking.pickup_name,
        "dropoff_name": booking.dropoff_name,
        "pickup_date": str(booking.pickup_date),
        "booking_number": booking.booking_number,
        "confirmation_url": confirmation_url,
    })

    await db.commit()

    return payment
