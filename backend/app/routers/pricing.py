import os
import math
from fastapi import APIRouter, Depends, HTTPException, Query
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


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@router.get("/common-routes/nearby")
async def get_nearby_common_routes(
    lat: float = Query(...),
    lng: float = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Returns directional route options (forward + virtual reverse for
    bidirectional routes), each oriented from→to, sorted by how close the
    guest is to the option's ORIGIN. Each option is flagged `near` if its
    origin is within the configured radius."""
    # Configurable "near you" radius
    rkm_r = await db.execute(select(Setting).where(Setting.key == "common_route_nearby_radius_km"))
    rkm_s = rkm_r.scalar_one_or_none()
    try:
        radius_km = float(rkm_s.value) if rkm_s and rkm_s.value not in (None, "") else 8.0
    except (TypeError, ValueError):
        radius_km = 8.0

    result = await db.execute(
        select(CommonRoute).where(CommonRoute.is_active == True).order_by(CommonRoute.sort_order)
    )
    routes = result.scalars().all()

    options = []
    for r in routes:
        if r.from_lat is None or r.to_lat is None:
            continue
        # Forward A->B (origin = from)
        options.append(_route_option(r, "forward", lat, lng))
        # Reverse B->A (origin = to)
        if getattr(r, "bidirectional", True):
            options.append(_route_option(r, "reverse", lat, lng))

    # Sort nearest-origin first; flag those within radius
    options.sort(key=lambda o: o["origin_distance_km"])
    for o in options:
        o["near"] = o["origin_distance_km"] <= radius_km

    return {"radius_km": radius_km, "routes": options}


def _route_option(r: CommonRoute, direction: str, lat: float, lng: float) -> dict:
    if direction == "reverse":
        o_name, o_addr, o_lat, o_lng = r.to_name, r.to_address, float(r.to_lat), float(r.to_lng)
        d_name, d_addr, d_lat, d_lng = r.from_name, r.from_address, float(r.from_lat), float(r.from_lng)
    else:
        o_name, o_addr, o_lat, o_lng = r.from_name, r.from_address, float(r.from_lat), float(r.from_lng)
        d_name, d_addr, d_lat, d_lng = r.to_name, r.to_address, float(r.to_lat), float(r.to_lng)

    return {
        "route_id": str(r.id),
        "name": r.name,
        "direction": direction,
        "from_name": o_name, "from_address": o_addr, "from_lat": o_lat, "from_lng": o_lng,
        "to_name": d_name, "to_address": d_addr, "to_lat": d_lat, "to_lng": d_lng,
        "distance_miles": float(r.distance_miles) if r.distance_miles else None,
        "prices": r.prices,
        "origin_distance_km": round(_haversine_km(o_lat, o_lng, lat, lng), 2),
    }


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
    keys = [
        "company_name", "company_phone", "company_email", "company_logo_url",
        "allow_cross_country_booking", "min_advance_booking_hours", "client_base_url",
        # Website content
        "website_hero_badge", "website_hero_title", "website_hero_title_accent",
        "website_hero_subtitle", "website_hero_image_url",
        "website_stat_rides", "website_stat_rating", "website_stat_uptime",
        "website_how_title", "website_how_subtitle",
        "website_why_title", "website_why_subtitle",
        "website_fleet_title", "website_fleet_subtitle",
        "website_testimonials_title", "website_testimonials_subtitle",
        "website_service_title", "website_service_subtitle",
        "website_contact_title", "website_contact_subtitle",
    ]
    result = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    settings = {s.key: s.value for s in result.scalars().all()}
    cross_country = str(settings.get("allow_cross_country_booking", "false")).lower() == "true"

    service_areas = await get_service_areas(db)
    available_countries = derive_country_codes(service_areas)

    out_settings = {k: str(settings.get(k, "")) for k in keys if k.startswith("website_")}
    return {
        "company_name": str(settings.get("company_name", "RideFlow")),
        "company_phone": str(settings.get("company_phone", "")),
        "company_email": str(settings.get("company_email", "")),
        "company_logo_url": str(settings.get("company_logo_url", "")),
        "client_base_url": str(settings.get("client_base_url", "")),
        **out_settings,
        "service_areas": service_areas,
        "available_countries": available_countries,  # legacy / derived
        "allow_cross_country_booking": cross_country,
        "min_advance_booking_hours": float(settings.get("min_advance_booking_hours", 0.5) or 0.5),
        "google_maps_api_key": _get_maps_key(),
    }
