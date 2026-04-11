from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import pricing, bookings, cashiers, auth, payments, drivers, admin
from app.services.payment_service import is_dev_mode

app = FastAPI(
    title="RideFlow API",
    description="Transport booking system — reservation-based ride service",
    version="0.1.0",
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


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "rideflow-api",
        "version": "0.1.0",
        "payment_mode": "dev_simulation" if is_dev_mode() else "live_stripe",
    }


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
