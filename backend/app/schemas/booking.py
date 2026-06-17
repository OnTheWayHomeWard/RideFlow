from uuid import UUID
from datetime import date, time, datetime
from pydantic import BaseModel, EmailStr, model_validator


class BookingCreateRequest(BaseModel):
    # Client info — phone OR email is required. Both are accepted and used:
    # confirmation, reminders, and status updates are sent over whichever
    # channels the rider provided.
    client_name: str
    client_phone: str | None = None
    client_email: EmailStr | None = None
    client_room: str | None = None

    @model_validator(mode="after")
    def _phone_or_email_required(self):
        phone = (self.client_phone or "").strip()
        email = (self.client_email or "").strip() if self.client_email else ""
        if not phone and not email:
            raise ValueError("Either a phone number or an email is required to book a ride.")
        return self

    # Route
    pickup_name: str
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    dropoff_name: str
    dropoff_address: str
    dropoff_lat: float
    dropoff_lng: float

    # Country codes (from Google Places autocomplete)
    pickup_country: str | None = None
    dropoff_country: str | None = None

    # Schedule — pickup_date/time are in the RIDER's local timezone.
    # pickup_tz_offset_minutes is what Date.getTimezoneOffset() returns
    # (minutes that local time lags UTC — e.g. EDT = +240, IST = -330).
    # Server converts to UTC before storing & comparing. Default 0 keeps
    # the legacy "assume UTC" behavior for any client that doesn't send it.
    pickup_date: date
    pickup_time: time
    pickup_tz_offset_minutes: int = 0

    # Trip details
    passengers: int = 1
    luggage: str = "none"
    vehicle_type: str

    # Extras
    extras: list[str] = []  # list of extra slugs

    # Cashier (from QR scan)
    cashier_ref_code: str | None = None

    # Rider's choice of the OPTIONAL SMS consent checkbox. Default False so
    # legacy clients that don't send it are treated as not-opted-in.
    sms_consent: bool = False


class BookingOut(BaseModel):
    id: UUID
    booking_number: str
    client_name: str
    # Either phone or email must be set, but not necessarily both — schema-level
    # validation runs at create time (see BookingCreateRequest). At read time
    # both fields are nullable so a booking made with just email serializes fine.
    client_phone: str | None = None
    client_email: str | None = None
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
    cancelled_at: datetime | None = None
    driver_name: str | None = None
    driver_vehicle: str | None = None
    driver_plate: str | None = None
    driver_color: str | None = None
    driver_phone: str | None = None
    has_rated: bool = False
