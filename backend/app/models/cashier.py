import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Cashier(Base):
    __tablename__ = "cashiers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hotel_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("hotels.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ref_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    commission_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    payout_method: Mapped[str] = mapped_column(String(20), default="bank")
    payout_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    stripe_connect_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_changed: Mapped[bool] = mapped_column(Boolean, default=False)
    total_referrals: Mapped[int] = mapped_column(Integer, default=0)
    total_earnings: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admins.id"), nullable=True)
