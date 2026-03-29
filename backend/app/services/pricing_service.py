"""
Pricing Engine — calculates ride prices based on:
1. Common route fixed price (if route matches)
2. Distance × per-mile rate + base fare (for custom routes)
3. Extras (add-ons)
4. Active upsales (applied silently — never shown to client)
"""
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vehicle_rate import VehicleRate
from app.models.extra import Extra
from app.models.common_route import CommonRoute
from app.models.upsale import Upsale


# Threshold for matching a common route (in degrees, ~0.5 mile)
COORD_MATCH_THRESHOLD = 0.008


async def find_matching_common_route(
    db: AsyncSession,
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
) -> CommonRoute | None:
    """Check if the pickup/dropoff coords match a pre-defined common route."""
    result = await db.execute(
        select(CommonRoute).where(CommonRoute.is_active == True)
    )
    routes = result.scalars().all()

    for route in routes:
        if route.from_lat is None or route.to_lat is None:
            continue
        from_match = (
            abs(float(route.from_lat) - pickup_lat) < COORD_MATCH_THRESHOLD
            and abs(float(route.from_lng) - pickup_lng) < COORD_MATCH_THRESHOLD
        )
        to_match = (
            abs(float(route.to_lat) - dropoff_lat) < COORD_MATCH_THRESHOLD
            and abs(float(route.to_lng) - dropoff_lng) < COORD_MATCH_THRESHOLD
        )
        if from_match and to_match:
            return route
    return None


async def get_vehicle_rate(db: AsyncSession, vehicle_type: str) -> VehicleRate | None:
    result = await db.execute(
        select(VehicleRate).where(
            VehicleRate.vehicle_type == vehicle_type,
            VehicleRate.is_active == True,
        )
    )
    return result.scalar_one_or_none()


async def get_extras_by_slugs(db: AsyncSession, slugs: list[str]) -> list[Extra]:
    if not slugs:
        return []
    result = await db.execute(
        select(Extra).where(Extra.slug.in_(slugs), Extra.is_active == True)
    )
    return list(result.scalars().all())


async def get_active_upsale(db: AsyncSession, vehicle_type: str) -> Upsale | None:
    """Find an active upsale that applies right now for this vehicle type."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Upsale).where(
            Upsale.is_active == True,
            Upsale.start_time <= now,
            Upsale.end_time >= now,
        )
    )
    upsales = result.scalars().all()

    for upsale in upsales:
        # null vehicle_types means applies to all
        if upsale.vehicle_types is None:
            return upsale
        if vehicle_type in upsale.vehicle_types:
            return upsale
    return None


def calculate_upsale_amount(base_amount: float, upsale: Upsale) -> float:
    if upsale.type == "flat":
        return float(upsale.amount)
    elif upsale.type == "percentage":
        return round(base_amount * float(upsale.amount) / 100, 2)
    return 0.0


async def calculate_price(
    db: AsyncSession,
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    vehicle_type: str,
    extra_slugs: list[str],
    distance_miles: float | None = None,
) -> dict:
    """
    Calculate the full price for a ride.
    Returns a dict with all pricing components.
    """
    rate = await get_vehicle_rate(db, vehicle_type)
    if not rate:
        raise ValueError(f"Vehicle type '{vehicle_type}' not found or inactive")

    # 1. Check for common route match (fixed price)
    common_route = await find_matching_common_route(
        db, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
    )

    if common_route and common_route.prices:
        # New format: _base key = single route amount + vehicle base fare
        if "_base" in common_route.prices:
            base_amount = float(common_route.prices["_base"]) + float(rate.base_fare)
        # Legacy format: per-vehicle prices
        elif vehicle_type in common_route.prices:
            base_amount = float(common_route.prices[vehicle_type])
        else:
            common_route = None  # no price for this vehicle, fall through to distance calc

        if common_route:
            route_distance = float(common_route.distance_miles) if common_route.distance_miles else None

    if not common_route:
        # Calculate from distance
        if distance_miles is None:
            # TODO: call Google Maps Distance Matrix API
            # For now, estimate from coordinates (rough)
            import math
            lat_diff = abs(pickup_lat - dropoff_lat)
            lng_diff = abs(pickup_lng - dropoff_lng)
            # Very rough: 1 degree ≈ 69 miles
            distance_miles = math.sqrt(lat_diff**2 + lng_diff**2) * 69

        base_amount = float(rate.base_fare) + (distance_miles * float(rate.per_mile_rate))
        route_distance = distance_miles

    base_amount = round(base_amount, 2)

    # 2. Calculate extras
    extras = await get_extras_by_slugs(db, extra_slugs)
    extras_amount = sum(float(e.price) for e in extras)
    extras_detail = [{"slug": e.slug, "name": e.name, "price": float(e.price)} for e in extras]

    # 3. Check for active upsale (silent — client never sees this)
    upsale = await get_active_upsale(db, vehicle_type)
    upsale_amount = 0.0
    if upsale:
        upsale_amount = calculate_upsale_amount(base_amount, upsale)

    # 4. Total
    total_amount = round(base_amount + extras_amount + upsale_amount, 2)

    return {
        "vehicle_type": vehicle_type,
        "base_amount": base_amount,
        "extras_amount": round(extras_amount, 2),
        "upsale_amount": round(upsale_amount, 2),
        "total_amount": total_amount,
        "distance_miles": round(route_distance, 1) if route_distance else None,
        "common_route_id": str(common_route.id) if common_route else None,
        "upsale_id": str(upsale.id) if upsale else None,
        "extras_detail": extras_detail,
    }


async def calculate_all_vehicle_prices(
    db: AsyncSession,
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    extra_slugs: list[str] | None = None,
) -> list[dict]:
    """
    Calculate prices for ALL vehicle types for a given route.
    Used on Screen 2 (car selection) to show all options with prices.
    """
    result = await db.execute(
        select(VehicleRate).where(VehicleRate.is_active == True).order_by(VehicleRate.sort_order)
    )
    rates = result.scalars().all()

    prices = []
    for rate in rates:
        try:
            price = await calculate_price(
                db, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
                rate.vehicle_type, extra_slugs or [],
            )
            price["display_name"] = rate.display_name
            price["max_passengers"] = rate.max_passengers
            price["max_luggage"] = rate.max_luggage
            price["image_url"] = rate.image_url
            price["icon"] = rate.icon
            prices.append(price)
        except ValueError:
            continue

    return prices
