from uuid import UUID
from datetime import date, time, datetime
from pydantic import BaseModel


class DriverRegisterRequest(BaseModel):
    name: str
    phone: str
    email: str | None = None
    password: str
    vehicle_type: str  # sedan, suv, van, large_van
    vehicle_make: str | None = None
    vehicle_plate: str | None = None
    vehicle_color: str | None = None
    license_number: str | None = None
    license_expiry: date | None = None
    has_insurance: bool = False
    payout_method: str = "bank"  # bank, zelle, stripe_connect
    payout_details: dict | None = None


class DriverOut(BaseModel):
    id: UUID
    name: str
    phone: str
    email: str | None = None
    photo_url: str | None = None
    vehicle_type: str
    vehicle_make: str | None = None
    vehicle_plate: str | None = None
    vehicle_color: str | None = None
    vehicle_photo_url: str | None = None
    status: str
    rating_avg: float
    total_rides: int
    total_earnings: float
    created_at: datetime

    model_config = {"from_attributes": True}


class AvailableRunOut(BaseModel):
    id: UUID
    booking_number: str
    pickup_name: str
    pickup_address: str
    dropoff_name: str
    dropoff_address: str
    pickup_date: date
    pickup_time: time
    passengers: int
    luggage: str
    vehicle_type: str
    driver_earnings: float  # only show what driver earns, never total

    model_config = {"from_attributes": True}


class DriverRunOut(BaseModel):
    id: UUID
    booking_number: str
    pickup_name: str
    pickup_address: str
    dropoff_name: str
    dropoff_address: str
    pickup_date: date
    pickup_time: time
    passengers: int
    luggage: str
    vehicle_type: str
    client_name: str
    client_phone: str
    client_room: str | None = None
    driver_earnings: float
    status: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    payout_status: str | None = None

    model_config = {"from_attributes": True}


class DriverEarningsOut(BaseModel):
    today: float
    today_rides: int
    this_week: float
    this_week_rides: int
    this_month: float
    this_month_rides: int


class LocationUpdate(BaseModel):
    lat: float
    lng: float
