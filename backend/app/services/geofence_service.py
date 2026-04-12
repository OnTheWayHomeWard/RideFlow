"""
Geofence validation — checks if a point is inside the service area.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geofence import Geofence


def point_in_polygon(point_lat: float, point_lng: float, polygon: list[dict]) -> bool:
    """Ray casting algorithm to check if point is inside polygon."""
    n = len(polygon)
    inside = False
    j = n - 1

    for i in range(n):
        xi, yi = polygon[i]["lat"], polygon[i]["lng"]
        xj, yj = polygon[j]["lat"], polygon[j]["lng"]

        if ((yi > point_lng) != (yj > point_lng)) and \
           (point_lat < (xj - xi) * (point_lng - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside


async def validate_location(db: AsyncSession, lat: float, lng: float) -> bool:
    """Check if a location is within any active geofence."""
    # Skip validation if coordinates are unknown (no Google Maps API)
    if lat == 0 and lng == 0:
        return True

    result = await db.execute(
        select(Geofence).where(Geofence.is_active == True)
    )
    geofences = result.scalars().all()

    if not geofences:
        return True  # no geofence defined = allow all

    for geofence in geofences:
        if point_in_polygon(lat, lng, geofence.polygon):
            return True

    return False
