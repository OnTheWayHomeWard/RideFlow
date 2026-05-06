from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import pricing, bookings, cashiers, auth, payments, drivers, admin, pickup_groups, website
from app.services.payment_service import is_dev_mode
from app.services.bootstrap import ensure_default_admin, ensure_default_settings
from app.services import reminder_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    await ensure_default_admin()
    await ensure_default_settings()
    reminder_scheduler.start()
    try:
        yield
    finally:
        await reminder_scheduler.stop()


app = FastAPI(
    title="RideFlow API",
    description="Transport booking system — reservation-based ride service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public routes
app.include_router(pricing.router)
app.include_router(bookings.router)
app.include_router(cashiers.router)
app.include_router(auth.router)
app.include_router(payments.router)

# Authenticated routes
app.include_router(drivers.router)
app.include_router(admin.router)
app.include_router(pickup_groups.router)
app.include_router(website.router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "rideflow-api",
        "version": "0.1.0",
        "payment_mode": "dev_simulation" if is_dev_mode() else "live_stripe",
    }


@app.post("/api/public/concierge-onboarding")
async def public_concierge_onboarding(token: str):
    """Public endpoint — concierge uses their onboarding token to start Stripe Connect."""
    from jose import jwt, JWTError
    from app.config import settings as app_settings
    from app.database import async_session
    from app.routers.admin import _start_concierge_stripe

    try:
        payload = jwt.decode(token, app_settings.JWT_SECRET, algorithms=[app_settings.JWT_ALGORITHM])
        if payload.get("role") != "concierge_onboarding":
            return {"error": "Invalid token"}
        concierge_id = payload.get("sub")
    except JWTError:
        return {"error": "Invalid or expired token"}

    async with async_session() as db:
        return await _start_concierge_stripe(concierge_id, db)


@app.get("/api/public/concierge-info")
async def public_concierge_info(token: str):
    """Public endpoint — get concierge name/status from onboarding token."""
    from jose import jwt, JWTError
    from app.config import settings as app_settings
    from app.database import async_session
    from sqlalchemy import select
    from app.models.concierge import Concierge
    from app.services.connect_service import get_account_details

    try:
        payload = jwt.decode(token, app_settings.JWT_SECRET, algorithms=[app_settings.JWT_ALGORITHM])
        if payload.get("role") != "concierge_onboarding":
            return {"error": "Invalid token"}
        concierge_id = payload.get("sub")
    except JWTError:
        return {"error": "Invalid or expired token"}

    async with async_session() as db:
        r = await db.execute(select(Concierge).where(Concierge.id == concierge_id))
        c = r.scalar_one_or_none()
        if not c:
            return {"error": "Concierge not found"}

        connected = False
        charges_enabled = False
        if c.stripe_connect_id:
            details = await get_account_details(c.stripe_connect_id)
            connected = True
            charges_enabled = details.get("charges_enabled", False)

        return {
            "name": c.name,
            "email": c.email,
            "connected": connected,
            "charges_enabled": charges_enabled,
        }


@app.get("/api/public/concierge-batch")
async def public_concierge_batch(token: str):
    """Public endpoint — concierge views their batch payout receipt via tokenized link."""
    from jose import jwt, JWTError
    from app.config import settings as app_settings
    from app.database import async_session
    from app.services.payout_batch_service import get_batch_detail

    try:
        payload = jwt.decode(token, app_settings.JWT_SECRET, algorithms=[app_settings.JWT_ALGORITHM])
        if payload.get("role") != "concierge_batch_view":
            return {"error": "Invalid token"}
        batch_id = payload.get("sub")
    except JWTError:
        return {"error": "Invalid or expired token"}

    async with async_session() as db:
        detail = await get_batch_detail(db, batch_id)
        if not detail:
            return {"error": "Batch not found"}
        # Strip admin-only fields
        detail["batch"].pop("note", None)
        detail["batch"].pop("failure_reason", None)
        return detail


@app.post("/api/test-sms")
async def test_sms(phone: str, message: str):
    """DEV ONLY — Test Twilio SMS. Hit from Postman to verify credentials work."""
    import os
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
    if sid in ("", "placeholder"):
        return {"error": "Twilio is in dev mode (SID is placeholder). Set real credentials in .env to test."}

    try:
        from twilio.rest import Client
        token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        from_number = os.environ.get("TWILIO_PHONE_NUMBER", "")
        client = Client(sid, token)
        msg = client.messages.create(body=message, from_=from_number, to=phone)
        return {"success": True, "sid": msg.sid, "to": phone, "status": msg.status}
    except Exception as e:
        return {"success": False, "error": str(e)}
