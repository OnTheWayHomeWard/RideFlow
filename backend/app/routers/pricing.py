from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle_rate import VehicleRate
from app.models.extra import Extra
from app.models.common_route import CommonRoute
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
            req.vehicle_type, req.extras,
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
        req.extras,
    )
