from uuid import UUID
from datetime import date, time, datetime
from pydantic import BaseModel


# ── Dashboard ──

class PeriodStats(BaseModel):
    rides: int = 0
    total_revenue: float = 0       # total collected from clients
    company_revenue: float = 0     # company keeps (after driver + cashier)
    driver_payouts: float = 0      # paid/owed to drivers
    cashier_payouts: float = 0     # paid to cashiers

class DashboardStats(BaseModel):
    today: PeriodStats
    this_week: PeriodStats
    this_month: PeriodStats

    # Booking status counts
    pending_bookings: int = 0
    paid_bookings: int = 0
    assigned_bookings: int = 0
    in_progress_bookings: int = 0
    completed_bookings: int = 0

    # Pending actions
    failed_transfers: int = 0
    pending_payouts: int = 0
    pending_driver_approvals: int = 0
    pending_cashier_approvals: int = 0

    # Fleet
    active_drivers: int = 0
    total_drivers: int = 0
    total_cashiers: int = 0
    total_hotels: int = 0

    # Rides per day (last 14 days) for chart
    rides_per_day: list[dict] = []

    # Revenue per day (last 14 days) for chart
    revenue_per_day: list[dict] = []

    # Top drivers (by rides this month)
    top_drivers: list[dict] = []

    # Top hotels (by referrals this month)
    top_hotels: list[dict] = []

    # Recent activity
    recent_bookings: list[dict] = []


# ── Payout Requests ──

class PayoutRequestOut(BaseModel):
    split_id: UUID
    booking_number: str
    booking_id: UUID
    pickup_name: str
    dropoff_name: str
    pickup_date: date
    pickup_time: time
    ordered_at: datetime | None
    completed_at: datetime | None
    driver_name: str
    driver_phone: str
    driver_id: UUID | None = None
    client_name: str
    client_phone: str
    vehicle_type: str
    total_fare: float
    driver_amount: float
    company_profit: float
    cashier_amount: float
    start_location: dict | None = None
    end_location: dict | None = None
    payout_status: str
    stripe_transfer_id: str | None = None
    driver_stripe_connected: bool = False
    # Client feedback
    client_rating: int | None = None
    client_comment: str | None = None


class PayoutActionRequest(BaseModel):
    note: str = ""


# ── Driver Management ──

class AdminDriverOut(BaseModel):
    id: UUID
    name: str
    phone: str
    email: str | None = None
    vehicle_type: str
    vehicle_make: str | None = None
    vehicle_plate: str | None = None
    vehicle_color: str | None = None
    license_number: str | None = None
    has_insurance: bool
    payout_method: str
    status: str
    pay_percentage: float
    rating_avg: float
    total_rides: int
    total_earnings: float
    created_at: datetime
    approved_at: datetime | None = None

    model_config = {"from_attributes": True}


class DriverUpdateRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    vehicle_type: str | None = None
    vehicle_make: str | None = None
    vehicle_plate: str | None = None
    vehicle_color: str | None = None
    license_number: str | None = None
    license_expiry: str | None = None
    has_insurance: bool | None = None
    pay_percentage: float | None = None
    payout_method: str | None = None
    payout_details: dict | None = None
    stripe_connect_id: str | None = None
    status: str | None = None


class ApproveRejectRequest(BaseModel):
    reason: str | None = None


# ── Hotel Management ──

class HotelCreateRequest(BaseModel):
    name: str
    address: str
    lat: float | None = None
    lng: float | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    default_commission_pct: float = 10.0
    concierge_id: UUID | None = None


class HotelOut(BaseModel):
    id: UUID
    name: str
    address: str
    lat: float | None = None
    lng: float | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    default_commission_pct: float
    is_active: bool
    concierge_id: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Cashier Management ──

class AdminCashierOut(BaseModel):
    id: UUID
    name: str
    phone: str
    email: str | None = None
    ref_code: str
    hotel_id: UUID | None = None
    hotel_name: str | None = None
    commission_pct: float | None = None
    status: str
    total_referrals: int
    total_earnings: float
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Upsale Management ──

class UpsaleCreateRequest(BaseModel):
    name: str
    type: str  # flat, percentage
    amount: float
    start_time: datetime
    end_time: datetime
    vehicle_types: list[str] | None = None
    driver_gets_upsale: bool = False
    cashier_gets_upsale: bool = True


class UpsaleOut(BaseModel):
    id: UUID
    name: str
    type: str
    amount: float
    start_time: datetime
    end_time: datetime
    vehicle_types: list | None = None
    driver_gets_upsale: bool
    cashier_gets_upsale: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Common Route Management ──

class RouteCreateRequest(BaseModel):
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
    sort_order: int = 0


# ── Settings ──

class SettingOut(BaseModel):
    key: str
    value: object
    description: str | None = None

    model_config = {"from_attributes": True}


class SettingUpdateRequest(BaseModel):
    key: str
    value: object


# ── Bookings List ──

class AdminBookingOut(BaseModel):
    id: UUID
    booking_number: str
    client_name: str
    client_phone: str
    pickup_name: str
    dropoff_name: str
    pickup_date: date
    pickup_time: time
    vehicle_type: str
    passengers: int
    total_amount: float
    status: str
    driver_name: str | None = None
    hotel_name: str | None = None
    cashier_name: str | None = None
    client_rating: int | None = None
    client_comment: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
