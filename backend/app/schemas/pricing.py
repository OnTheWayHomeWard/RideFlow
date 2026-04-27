from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class VehicleRateOut(BaseModel):
    id: UUID
    vehicle_type: str
    display_name: str
    base_fare: float
    per_mile_rate: float
    max_passengers: int
    max_luggage: int
    image_url: str | None = None
    icon: str | None = None
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


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
