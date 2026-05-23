import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class CommonRoute(Base):
    __tablename__ = "common_routes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    from_name: Mapped[str] = mapped_column(String(200), nullable=False)
    from_address: Mapped[str] = mapped_column(Text, nullable=False)
    from_lat: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    from_lng: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    to_name: Mapped[str] = mapped_column(String(200), nullable=False)
    to_address: Mapped[str] = mapped_column(Text, nullable=False)
    to_lat: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    to_lng: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    distance_miles: Mapped[float | None] = mapped_column(Numeric(6, 1), nullable=True)
    prices: Mapped[dict] = mapped_column(JSONB, nullable=False)  # {"sedan": 35, "suv": 45, ...}
    # If true, the reverse trip (B->A) is offered virtually at the same price.
    bidirectional: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
