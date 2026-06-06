import uuid
from datetime import datetime, date, time

from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text, Date, Time, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)

    # Client info
    client_name: Mapped[str] = mapped_column(String(100), nullable=False)
    client_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    client_room: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Route
    pickup_name: Mapped[str] = mapped_column(String(200), nullable=False)
    pickup_address: Mapped[str] = mapped_column(Text, nullable=False)
    pickup_lat: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    pickup_lng: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    dropoff_name: Mapped[str] = mapped_column(String(200), nullable=False)
    dropoff_address: Mapped[str] = mapped_column(Text, nullable=False)
    dropoff_lat: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    dropoff_lng: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    distance_miles: Mapped[float | None] = mapped_column(Numeric(6, 1), nullable=True)

    # Schedule
    pickup_date: Mapped[date] = mapped_column(Date, nullable=False)
    pickup_time: Mapped[time] = mapped_column(Time, nullable=False)

    # Whether the rider opted in to receive transactional SMS (the OPTIONAL
    # checkbox on the booking form). Default False so missing/legacy bookings
    # behave as not-opted-in. An admin-level setting (sms_override_consent)
    # can force-send regardless of this flag.
    sms_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Trip details
    passengers: Mapped[int] = mapped_column(Integer, default=1)
    luggage: Mapped[str] = mapped_column(String(20), default="none")
    vehicle_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Pricing
    base_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    extras_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    upsale_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    # Silent surcharges from matching pickup/dropoff groups. Not shown to the
    # rider as line items; included in total_amount. Kept on the booking for
    # audit/reporting.
    pickup_surcharge: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    dropoff_surcharge: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # When a common route is permanently deleted, NULL out the FK on historical
    # bookings so the delete succeeds without losing booking data.
    common_route_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("common_routes.id", ondelete="SET NULL"), nullable=True)
    upsale_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("upsales.id"), nullable=True)
    extras_chosen: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    cashier_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cashiers.id"), nullable=True, index=True)
    hotel_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("hotels.id"), nullable=True, index=True)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"), nullable=True, index=True)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)

    # Timestamps
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Reminder + driver action notifications (idempotency keys for the scheduler / button presses)
    client_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    client_final_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    driver_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    driver_on_way_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    driver_arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Location tracking
    start_location: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    end_location: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Meta
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
