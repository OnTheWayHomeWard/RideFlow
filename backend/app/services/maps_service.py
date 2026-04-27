"""
Google Maps Distance Matrix integration.
Returns the real driving distance between two points.
Falls back to straight-line distance if API key isn't configured.
"""
import os
import math
import httpx


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance using haversine formula. Returns miles."""
    R = 3958.8  # Earth radius in miles
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _get_maps_key() -> str:
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if key in ("", "placeholder", "your_key_here"):
        return ""
    return key


async def driving_distance_miles(pickup_lat: float, pickup_lng: float, dropoff_lat: float, dropoff_lng: float) -> float:
    """
    Returns driving distance in miles between pickup and dropoff.
    Uses Google Distance Matrix API; falls back to haversine if no key or API error.
    """
    key = _get_maps_key()
    if not key:
        return _haversine_miles(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)

    if (pickup_lat == 0 and pickup_lng == 0) or (dropoff_lat == 0 and dropoff_lng == 0):
        return _haversine_miles(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)

    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    params = {
        "origins": f"{pickup_lat},{pickup_lng}",
        "destinations": f"{dropoff_lat},{dropoff_lng}",
        "units": "imperial",
        "mode": "driving",
        "key": key,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            data = resp.json()
            if data.get("status") != "OK":
                print(f"[Distance Matrix] status={data.get('status')} error={data.get('error_message')}")
                return _haversine_miles(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)

            row = data["rows"][0]
            element = row["elements"][0]
            if element.get("status") != "OK":
                print(f"[Distance Matrix] element status={element.get('status')} — falling back to haversine")
                return _haversine_miles(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)

            # distance.value is in meters
            meters = element["distance"]["value"]
            miles = meters / 1609.344
            return round(miles, 2)
    except Exception as e:
        print(f"[Distance Matrix] request failed: {e}")
        return _haversine_miles(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
