import uuid
from datetime import datetime, date, time

from sqlalchemy import String, Boolean, DateTime, Date, Time, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Upsale(Base):
    __tablename__ = "upsales"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'flat' or 'percentage'
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    # Optional date range — null means no bound (always)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Optional daily time-of-day window — both null means all day.
    # If end < start (e.g. 22:00–04:00), wraps over midnight.
    daily_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    daily_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    vehicle_types: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # null = all
    driver_gets_upsale: Mapped[bool] = mapped_column(Boolean, default=False)
    cashier_gets_upsale: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admins.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
