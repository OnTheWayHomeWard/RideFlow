import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle_rate import VehicleRate
from app.models.extra import Extra
from app.models.common_route import CommonRoute
from app.models.setting import Setting
from app.schemas.pricing import (
    VehicleRateOut, ExtraOut, CommonRouteOut,
    PriceCalculateRequest, PriceCalculateResponse,
    AllVehiclePricesRequest, VehiclePriceOut,
)
from app.services.pricing_service import calculate_price, calculate_all_vehicle_prices
from app.services.geofence_service import validate_location

router = APIRouter(prefix="/api", tags=["pricing"])


@router.get("/vehicle-rates", response_model=list[VehicleRateOut])
async def get_vehicle_rates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VehicleRate).where(VehicleRate.is_active == True).order_by(VehicleRate.sort_order)
    )
    return result.scalars().all()


@router.get("/extras", response_model=list[ExtraOut])
async def get_extras(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Extra).where(Extra.is_active == True)
    )
    return result.scalars().all()


@router.get("/common-routes", response_model=list[CommonRouteOut])
async def get_common_routes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CommonRoute).where(CommonRoute.is_active == True).order_by(CommonRoute.sort_order)
    )
    return result.scalars().all()


@router.post("/pricing/calculate", response_model=PriceCalculateResponse)
async def calculate_ride_price(req: PriceCalculateRequest, db: AsyncSession = Depends(get_db)):
    """Calculate price for a specific vehicle type and route."""
    # Validate geofence
    pickup_ok = await validate_location(db, req.pickup_lat, req.pickup_lng)
    if not pickup_ok:
        raise HTTPException(status_code=400, detail="Pickup location is outside our service area")

    dropoff_ok = await validate_location(db, req.dropoff_lat, req.dropoff_lng)
    if not dropoff_ok:
        raise HTTPException(status_code=400, detail="Destination is outside our service area")

    try:
        result = await calculate_price(
            db, req.pickup_lat, req.pickup_lng,
            req.dropoff_lat, req.dropoff_lng,
            req.vehicle_type, req.extras, pickup_dt=req.pickup_dt,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/pricing/calculate-all", response_model=list[VehiclePriceOut])
async def calculate_all_prices(req: AllVehiclePricesRequest, db: AsyncSession = Depends(get_db)):
    """
    Calculate prices for ALL vehicle types for a given route.
    Used on Screen 2 — shows all cars with their prices.
    """
    pickup_ok = await validate_location(db, req.pickup_lat, req.pickup_lng)
    if not pickup_ok:
        raise HTTPException(status_code=400, detail="Pickup location is outside our service area")

    dropoff_ok = await validate_location(db, req.dropoff_lat, req.dropoff_lng)
    if not dropoff_ok:
        raise HTTPException(status_code=400, detail="Destination is outside our service area")

    return await calculate_all_vehicle_prices(
        db, req.pickup_lat, req.pickup_lng,
        req.dropoff_lat, req.dropoff_lng,
        req.extras, pickup_dt=req.pickup_dt,
    )


def _get_maps_key() -> str:
    """Return Google Maps API key from env only, filtering out placeholders."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if key in ("", "placeholder", "your_key_here"):
        return ""
    return key


@router.get("/settings/public")
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Public company settings — no auth needed. Used by client app for branding."""
    from app.services.service_area_service import get_service_areas, derive_country_codes
    keys = ["company_name", "company_phone", "company_email", "company_logo_url", "allow_cross_country_booking", "min_advance_booking_hours", "client_base_url"]
    result = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    settings = {s.key: s.value for s in result.scalars().all()}
    cross_country = str(settings.get("allow_cross_country_booking", "false")).lower() == "true"

    service_areas = await get_service_areas(db)
    available_countries = derive_country_codes(service_areas)

    return {
        "company_name": str(settings.get("company_name", "RideFlow")),
        "company_phone": str(settings.get("company_phone", "")),
        "company_email": str(settings.get("company_email", "")),
        "company_logo_url": str(settings.get("company_logo_url", "")),
        "client_base_url": str(settings.get("client_base_url", "")),
        "service_areas": service_areas,
        "available_countries": available_countries,  # legacy / derived
        "allow_cross_country_booking": cross_country,
        "min_advance_booking_hours": float(settings.get("min_advance_booking_hours", 0.5) or 0.5),
        "google_maps_api_key": _get_maps_key(),
    }
