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
