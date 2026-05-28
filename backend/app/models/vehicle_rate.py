import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class VehicleRate(Base):
    __tablename__ = "vehicle_rates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_type: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    base_fare: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    per_mile_rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)  # fallback when rate_tiers is empty
    # Optional distance-tier pricing: a list of {to: number|null, rate: number}
    # sorted ascending. Each tier prices the band [prev_to, to). The last tier's
    # `to` is null ("and up"). Empty list = use the flat per_mile_rate above.
    rate_tiers: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    max_passengers: Mapped[int] = mapped_column(Integer, nullable=False)
    max_luggage: Mapped[int] = mapped_column(Integer, default=2)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
