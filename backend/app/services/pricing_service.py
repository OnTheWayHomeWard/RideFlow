"""
Pricing Engine — calculates ride prices based on:
1. Common route fixed price (if route matches)
2. Distance × per-mile rate + base fare (for custom routes)
3. Extras (add-ons)
4. Active upsales (applied silently — never shown to client). Multiple upsales
   may stack; each upsale optionally limits itself to a date range and/or a
   daily time-of-day window.
"""
from datetime import datetime, timezone, time as _time
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
    """Find the pre-defined common route that best matches the pickup/dropoff
    coords. When several routes are within the match threshold (e.g. two resorts
    in the same complex, or routes sharing an airport endpoint), return the
    CLOSEST one — matching by first-in-DB order would otherwise pick the wrong
    route and charge the wrong price."""
    result = await db.execute(
        select(CommonRoute).where(CommonRoute.is_active == True)
    )
    routes = result.scalars().all()

    def near(a_lat, a_lng, b_lat, b_lng):
        return (abs(float(a_lat) - b_lat) < COORD_MATCH_THRESHOLD
                and abs(float(a_lng) - b_lng) < COORD_MATCH_THRESHOLD)

    def dist2(a_lat, a_lng, b_lat, b_lng):
        return (float(a_lat) - b_lat) ** 2 + (float(a_lng) - b_lng) ** 2

    best = None
    best_score = None
    for route in routes:
        if route.from_lat is None or route.to_lat is None:
            continue
        # Forward: pickup≈from and dropoff≈to
        if near(route.from_lat, route.from_lng, pickup_lat, pickup_lng) and \
           near(route.to_lat, route.to_lng, dropoff_lat, dropoff_lng):
            score = (dist2(route.from_lat, route.from_lng, pickup_lat, pickup_lng)
                     + dist2(route.to_lat, route.to_lng, dropoff_lat, dropoff_lng))
            if best_score is None or score < best_score:
                best, best_score = route, score
        # Reverse (B->A): pickup≈to and dropoff≈from — only if bidirectional
        if getattr(route, "bidirectional", True) and \
           near(route.to_lat, route.to_lng, pickup_lat, pickup_lng) and \
           near(route.from_lat, route.from_lng, dropoff_lat, dropoff_lng):
            score = (dist2(route.to_lat, route.to_lng, pickup_lat, pickup_lng)
                     + dist2(route.from_lat, route.from_lng, dropoff_lat, dropoff_lng))
            if best_score is None or score < best_score:
                best, best_score = route, score
    return best


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


def _time_in_window(t: _time, start: _time | None, end: _time | None) -> bool:
    """Both null → all-day match. End-before-start wraps midnight (e.g. 22:00–04:00)."""
    if start is None and end is None:
        return True
    if start is None:
        return t <= end
    if end is None:
        return t >= start
    if start <= end:
        return start <= t <= end
    # wrap over midnight
    return t >= start or t <= end


def upsale_applies(upsale: Upsale, vehicle_type: str, pickup_dt: datetime) -> bool:
    if not upsale.is_active:
        return False
    if upsale.vehicle_types is not None and vehicle_type not in upsale.vehicle_types:
        return False
    pickup_date = pickup_dt.date()
    if upsale.start_date and pickup_date < upsale.start_date:
        return False
    if upsale.end_date and pickup_date > upsale.end_date:
        return False
    if not _time_in_window(pickup_dt.time(), upsale.daily_start_time, upsale.daily_end_time):
        return False
    return True


async def get_active_upsales(
    db: AsyncSession, vehicle_type: str, pickup_dt: datetime
) -> list[Upsale]:
    """Return every active upsale whose date/time/vehicle filters match."""
    result = await db.execute(select(Upsale).where(Upsale.is_active == True))
    return [u for u in result.scalars().all() if upsale_applies(u, vehicle_type, pickup_dt)]


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
    pickup_dt: datetime | None = None,
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
        # Calculate from real driving distance (Google Distance Matrix API)
        if distance_miles is None:
            from app.services.maps_service import driving_distance_miles
            distance_miles = await driving_distance_miles(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)

        base_amount = float(rate.base_fare) + (distance_miles * float(rate.per_mile_rate))
        route_distance = distance_miles

    base_amount = round(base_amount, 2)

    # 2. Calculate extras
    extras = await get_extras_by_slugs(db, extra_slugs)
    extras_amount = sum(float(e.price) for e in extras)
    extras_detail = [{"slug": e.slug, "name": e.name, "price": float(e.price)} for e in extras]

    # 3. Sum all active upsales whose filters match (silent — client never sees this)
    if pickup_dt is None:
        pickup_dt = datetime.now(timezone.utc)
    upsales = await get_active_upsales(db, vehicle_type, pickup_dt)
    upsale_amount = round(sum(calculate_upsale_amount(base_amount, u) for u in upsales), 2)
    applied_upsales = [
        {"id": str(u.id), "name": u.name, "type": u.type, "amount": float(u.amount)}
        for u in upsales
    ]

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
        "upsale_id": applied_upsales[0]["id"] if applied_upsales else None,
        "applied_upsales": applied_upsales,
        "extras_detail": extras_detail,
    }


async def calculate_all_vehicle_prices(
    db: AsyncSession,
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    extra_slugs: list[str] | None = None,
    pickup_dt: datetime | None = None,
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
                rate.vehicle_type, extra_slugs or [], pickup_dt=pickup_dt,
            )
            price["display_name"] = rate.display_name
            price["max_passengers"] = rate.max_passengers
            price["max_luggage"] = rate.max_luggage
            price["image_url"] = rate.image_url
            price["description"] = rate.description
            price["icon"] = rate.icon
            prices.append(price)
        except ValueError:
            continue

    return prices
