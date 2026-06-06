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


def tiered_distance_cost(distance_miles: float, tiers: list, fallback_rate: float) -> float:
    """Compute the per-mile portion of a fare using incremental distance tiers.

    Tiers are an ascending list of {to: float|null, rate: float}. Each tier
    prices the band [previous_to, to). The last tier's `to` is null ("and up").
    Example: tiers=[{to:10, rate:6},{to:20, rate:5},{to:null, rate:4}]
      15 miles ->  10*6 + 5*5  = 85
      25 miles ->  10*6 + 10*5 + 5*4 = 130

    If `tiers` is empty/missing or malformed, falls back to
    `distance_miles * fallback_rate` (the legacy flat per_mile_rate).
    """
    if not tiers or distance_miles <= 0:
        return float(distance_miles) * float(fallback_rate)
    try:
        clean = sorted(
            [t for t in tiers if isinstance(t, dict) and "rate" in t],
            # null `to` sorts last (interpreted as +infinity)
            key=lambda t: (1 if t.get("to") is None else 0, float(t.get("to") or 0)),
        )
    except (TypeError, ValueError):
        return float(distance_miles) * float(fallback_rate)
    if not clean:
        return float(distance_miles) * float(fallback_rate)

    remaining = float(distance_miles)
    prev = 0.0
    total = 0.0
    for t in clean:
        rate = float(t["rate"])
        upper = t.get("to")
        if upper is None:
            total += remaining * rate
            remaining = 0.0
            break
        band = max(float(upper) - prev, 0.0)
        take = min(remaining, band)
        total += take * rate
        remaining -= take
        prev = float(upper)
        if remaining <= 0:
            break
    # If the tiers don't extend to cover the full distance (no open-ended last
    # tier defined), extend the LAST tier's rate for the overflow — this matches
    # the natural "and so on" reading of a tier list. Falling back to a legacy
    # per_mile_rate of 0 would silently undercharge long trips.
    if remaining > 0:
        extend_rate = float(clean[-1]["rate"]) if clean else float(fallback_rate)
        total += remaining * extend_rate
    return total


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

    # Try to read a fixed price for THIS vehicle from the matched route.
    # A common route may now legitimately have no price for some vehicles (or
    # no prices at all) — admin's "two options" UX. In that case we keep the
    # route association (still common_route_id'd) but compute the fare from
    # distance + per-mile tiers, preferring the route's admin-entered
    # distance_miles when available.
    fixed_price = None
    if common_route and common_route.prices:
        prices = common_route.prices
        if "_base" in prices:
            try:
                fixed_price = float(prices["_base"]) + float(rate.base_fare)
            except (TypeError, ValueError):
                fixed_price = None
        elif vehicle_type in prices:
            try:
                v = prices[vehicle_type]
                if v not in ("", None):
                    fixed_price = float(v)
            except (TypeError, ValueError):
                fixed_price = None

    if fixed_price is not None:
        base_amount = fixed_price
        route_distance = float(common_route.distance_miles) if (common_route and common_route.distance_miles) else None
    else:
        # No fixed price (no match, or matched route has no price for this
        # vehicle). Compute from distance: prefer the route's distance_miles
        # if the admin entered one (saves a Google API call), otherwise hit
        # the Distance Matrix.
        if distance_miles is None:
            if common_route and common_route.distance_miles:
                distance_miles = float(common_route.distance_miles)
            else:
                from app.services.maps_service import driving_distance_miles
                distance_miles = await driving_distance_miles(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)

        # Tiers: per-vehicle override OR the global default set in admin
        # Settings. per_mile_rate is the silent emergency backstop only.
        tiers_for_calc = list(rate.rate_tiers or [])
        if not tiers_for_calc:
            from app.models.setting import Setting
            dt_row = await db.execute(select(Setting).where(Setting.key == "default_rate_tiers"))
            dt_setting = dt_row.scalar_one_or_none()
            if dt_setting and isinstance(dt_setting.value, list):
                tiers_for_calc = dt_setting.value

        distance_cost = tiered_distance_cost(distance_miles, tiers_for_calc, float(rate.per_mile_rate or 0))
        base_amount = float(rate.base_fare) + distance_cost
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

    # 4. Silent pickup/dropoff group surcharges. These add to the total without
    # being broken out as line items on the rider-facing screen — same idea as
    # upsales but driven by location rather than time.
    from app.services import pickup_group_service, dropoff_group_service
    pickup_matches = await pickup_group_service.match_groups(db, pickup_lat, pickup_lng)
    dropoff_matches = await dropoff_group_service.match_groups(db, dropoff_lat, dropoff_lng)
    pickup_surcharge = round(sum(float(m.get("surcharge_amount") or 0) for m in pickup_matches), 2)
    dropoff_surcharge = round(sum(float(m.get("surcharge_amount") or 0) for m in dropoff_matches), 2)

    # 5. Total
    total_amount = round(
        base_amount + extras_amount + upsale_amount + pickup_surcharge + dropoff_surcharge, 2
    )

    return {
        "vehicle_type": vehicle_type,
        "base_amount": base_amount,
        "extras_amount": round(extras_amount, 2),
        "upsale_amount": round(upsale_amount, 2),
        "pickup_surcharge": pickup_surcharge,
        "dropoff_surcharge": dropoff_surcharge,
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
