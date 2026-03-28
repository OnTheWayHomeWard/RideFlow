from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.services.payment_service import create_checkout_session, confirm_payment, is_dev_mode

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/create-checkout")
async def create_checkout(booking_number: str, db: AsyncSession = Depends(get_db)):
    """
    Create a payment checkout session for a booking.
    Returns a URL to redirect the client to (Stripe or dev simulator).
    """
    result = await db.execute(
        select(Booking).where(Booking.booking_number == booking_number)
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != "pending":
        raise HTTPException(status_code=400, detail=f"Booking is already {booking.status}")

    checkout = await create_checkout_session(db, booking)

    return {
        "booking_number": booking.booking_number,
        "total_amount": float(booking.total_amount),
        **checkout,
    }


@router.get("/dev-confirm/{booking_number}")
async def dev_confirm_payment(booking_number: str, db: AsyncSession = Depends(get_db)):
    """
    DEV MODE ONLY — simulates a successful payment.
    In production this would be handled by Stripe webhook.
    Visiting this URL = client paid successfully.
    """
    if not is_dev_mode():
        raise HTTPException(status_code=403, detail="Dev mode is not enabled")

    result = await db.execute(
        select(Booking).where(Booking.booking_number == booking_number)
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != "pending":
        raise HTTPException(status_code=400, detail=f"Booking is already {booking.status}")

    # Simulate payment confirmation
    payment = await confirm_payment(db, booking)

    return {
        "message": "DEV MODE — Payment simulated successfully",
        "booking_number": booking.booking_number,
        "status": booking.status,
        "payment_id": str(payment.id),
        "total_amount": float(booking.total_amount),
        "splits": "Payment splits created (cashier: immediate, driver: pending admin release)",
    }


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Stripe webhook handler — called by Stripe when payment completes.
    Verifies signature, confirms payment, creates splits.
    """
    if is_dev_mode():
        raise HTTPException(status_code=400, detail="Use /dev-confirm in dev mode")

    import stripe
    from app.config import settings as app_settings

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, app_settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        booking_number = session.get("metadata", {}).get("booking_number")

        if not booking_number:
            raise HTTPException(status_code=400, detail="No booking_number in metadata")

        result = await db.execute(
            select(Booking).where(Booking.booking_number == booking_number)
        )
        booking = result.scalar_one_or_none()

        if booking and booking.status == "pending":
            await confirm_payment(
                db, booking,
                stripe_payment_id=session.get("payment_intent"),
                stripe_session_id=session.get("id"),
            )

    return {"status": "ok"}
