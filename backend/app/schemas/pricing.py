from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class VehicleRateOut(BaseModel):
    id: UUID
    vehicle_type: str
    display_name: str
    base_fare: float
    per_mile_rate: float
    rate_tiers: list[dict] = []  # [{to: number|null, rate: number}], ascending
    max_passengers: int
    max_luggage: int
    image_url: str | None = None
    icon: str | None = None
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class RateTier(BaseModel):
    """One distance band in a vehicle's tiered per-mile pricing.

    `to` is the upper bound (in miles) for this band; the lower bound is
    the previous tier's `to` (or 0 for the first). The final tier's `to`
    must be null ("and beyond"). `rate` is $/mile within the band.
    """
    to: float | None = None
    rate: float


class VehicleRateCreate(BaseModel):
    vehicle_type: str
    display_name: str
    base_fare: float
    # Legacy flat per-mile rate is no longer surfaced in the admin UI —
    # tiered pricing (per-vehicle or global default) is the source of truth.
    # Kept on the model as a silent emergency fallback only.
    per_mile_rate: float = 0
    rate_tiers: list[RateTier] = []
    max_passengers: int
    max_luggage: int = 2
    sort_order: int = 0
    image_url: str | None = None
    description: str | None = None


class VehicleRateUpdate(BaseModel):
    display_name: str | None = None
    base_fare: float | None = None
    per_mile_rate: float | None = None
    rate_tiers: list[RateTier] | None = None
    max_passengers: int | None = None
    max_luggage: int | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    image_url: str | None = None
    description: str | None = None


class ExtraOut(BaseModel):
    id: UUID
    name: str
    slug: str
    price: float
    description: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class CommonRouteOut(BaseModel):
    id: UUID
    name: str
    from_name: str
    from_address: str
    from_lat: float | None = None
    from_lng: float | None = None
    to_name: str
    to_address: str
    to_lat: float | None = None
    to_lng: float | None = None
    distance_miles: float | None = None
    prices: dict
    from_price: float | None = None  # lowest upsale-adjusted price across vehicles
    bidirectional: bool = True
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class PriceCalculateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    vehicle_type: str
    extras: list[str] = []  # list of extra slugs
    pickup_dt: datetime | None = None  # when the ride is — used for time-of-day upsales


class PriceCalculateResponse(BaseModel):
    vehicle_type: str
    base_amount: float
    extras_amount: float
    upsale_amount: float  # hidden from client display, but included in total
    total_amount: float
    distance_miles: float | None = None
    common_route_id: str | None = None
    upsale_id: str | None = None
    applied_upsales: list[dict] = []
    extras_detail: list[dict] = []


class AllVehiclePricesRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    extras: list[str] = []
    pickup_dt: datetime | None = None


class VehiclePriceOut(BaseModel):
    vehicle_type: str
    display_name: str
    max_passengers: int
    max_luggage: int
    image_url: str | None = None
    icon: str | None = None
    base_amount: float
    extras_amount: float
    upsale_amount: float
    total_amount: float
    distance_miles: float | None = None
    common_route_id: str | None = None
    upsale_id: str | None = None
    applied_upsales: list[dict] = []
    extras_detail: list[dict] = []
