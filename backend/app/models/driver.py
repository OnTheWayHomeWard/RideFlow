import uuid
from datetime import datetime, date

from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Personal
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Vehicle
    vehicle_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    vehicle_make: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vehicle_plate: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vehicle_color: Mapped[str | None] = mapped_column(String(30), nullable=True)
    vehicle_photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Credentials
    license_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    license_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    license_photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_insurance: Mapped[bool] = mapped_column(Boolean, default=False)

    # Payout
    pay_percentage: Mapped[float] = mapped_column(Numeric(5, 2), default=70.00)
    payout_method: Mapped[str] = mapped_column(String(20), default="bank")
    payout_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    stripe_connect_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Status
    priority_level: Mapped[int] = mapped_column(Integer, default=2, index=True)  # 1=High, 2=Normal, 3=Low
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    password_changed: Mapped[bool] = mapped_column(Boolean, default=False)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Stats
    rating_avg: Mapped[float] = mapped_column(Numeric(3, 2), default=0)
    total_rides: Mapped[int] = mapped_column(Integer, default=0)
    total_earnings: Mapped[float] = mapped_column(Numeric(10, 2), default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admins.id"), nullable=True)
    last_online_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
