from uuid import UUID
from datetime import date, time, datetime
from pydantic import BaseModel


class BookingCreateRequest(BaseModel):
    # Client info
    client_name: str
    client_phone: str
    client_room: str | None = None

    # Route
    pickup_name: str
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    dropoff_name: str
    dropoff_address: str
    dropoff_lat: float
    dropoff_lng: float

    # Schedule
    pickup_date: date
    pickup_time: time

    # Trip details
    passengers: int = 1
    luggage: str = "none"
    vehicle_type: str

    # Extras
    extras: list[str] = []  # list of extra slugs

    # Cashier (from QR scan)
    cashier_ref_code: str | None = None


class BookingOut(BaseModel):
    id: UUID
    booking_number: str
    client_name: str
    client_phone: str
    client_room: str | None = None

    pickup_name: str
    pickup_address: str
    dropoff_name: str
    dropoff_address: str
    distance_miles: float | None = None

    pickup_date: date
    pickup_time: time

    passengers: int
    luggage: str
    vehicle_type: str

    base_amount: float
    extras_amount: float
    total_amount: float
    extras_chosen: list | None = None

    cashier_id: UUID | None = None
    hotel_id: UUID | None = None
    driver_id: UUID | None = None

    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BookingStatusOut(BaseModel):
    booking_number: str
    status: str
    vehicle_type: str
    pickup_name: str
    dropoff_name: str
    pickup_date: date
    pickup_time: time
    total_amount: float
    driver_name: str | None = None
    driver_vehicle: str | None = None
    driver_plate: str | None = None
    driver_color: str | None = None
    driver_phone: str | None = None
