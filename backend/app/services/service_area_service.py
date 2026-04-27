"""
Service area validation — supports country-level + city-level (bounding box).
"""
import json
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import Setting


def point_in_bounds(lat: float, lng: float, bounds: dict) -> bool:
    """Check if a point falls within a bounding box (north/south/east/west)."""
    if not bounds:
        return False
    return (bounds.get("south", -90) <= lat <= bounds.get("north", 90)
            and bounds.get("west", -180) <= lng <= bounds.get("east", 180))


def location_in_service_areas(lat: float, lng: float, country: str | None, areas: list[dict]) -> bool:
    """
    Returns True if the location is within at least one configured service area.
    - If areas is empty/None → allow all (unset)
    - If lat=0 lng=0 → allow (no Google Maps key fallback, can't validate coords)
    """
    if not areas:
        return True
    if lat == 0 and lng == 0:
        return True

    cc = (country or "").upper()
    for a in areas:
        if a.get("type") == "country" and (a.get("country") or "").upper() == cc:
            return True
        if a.get("type") == "city" and point_in_bounds(lat, lng, a.get("bounds") or {}):
            return True
    return False


def derive_country_codes(areas: list[dict]) -> list[str]:
    """Extract unique country codes for Google Places componentRestrictions (max 5)."""
    if not areas:
        return []
    codes = set()
    for a in areas:
        c = (a.get("country") or "").upper()
        if c:
            codes.add(c)
    return list(codes)[:5]


def area_display_names(areas: list[dict]) -> list[str]:
    """Human-readable area names for display in client warnings."""
    out = []
    for a in areas:
        if a.get("type") == "city":
            out.append(f"{a.get('name')} ({a.get('country')})")
        else:
            out.append(a.get("name") or a.get("country") or "?")
    return out


# Country code → display name (for legacy → service_areas migration)
COUNTRY_NAME_MAP = {
    "US": "United States", "GB": "United Kingdom", "CA": "Canada", "AU": "Australia",
    "DE": "Germany", "FR": "France", "IT": "Italy", "ES": "Spain", "NL": "Netherlands",
    "ET": "Ethiopia", "KE": "Kenya", "NG": "Nigeria", "GH": "Ghana", "ZA": "South Africa",
    "TZ": "Tanzania", "UG": "Uganda", "RW": "Rwanda", "EG": "Egypt", "MA": "Morocco",
    "IN": "India", "CN": "China", "JP": "Japan", "AE": "UAE", "SA": "Saudi Arabia",
    "MX": "Mexico", "BR": "Brazil", "AR": "Argentina",
}


async def get_service_areas(db: AsyncSession) -> list[dict]:
    """Load service_areas from settings, with lazy migration from available_countries."""
    r = await db.execute(select(Setting).where(Setting.key == "service_areas"))
    s = r.scalar_one_or_none()

    if s and s.value:
        val = s.value
        if isinstance(val, str):
            try: val = json.loads(val)
            except: val = []
        if isinstance(val, list):
            return val

    # Lazy migration from available_countries
    r2 = await db.execute(select(Setting).where(Setting.key == "available_countries"))
    s2 = r2.scalar_one_or_none()
    if s2 and s2.value:
        codes = s2.value
        if isinstance(codes, str):
            try: codes = json.loads(codes)
            except: codes = []
        if isinstance(codes, list):
            return [{"type": "country", "country": c.upper(),
                     "name": COUNTRY_NAME_MAP.get(c.upper(), c.upper())} for c in codes]

    return []
