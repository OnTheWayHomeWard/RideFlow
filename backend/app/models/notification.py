"""Persisted in-app notification — one row per recipient, per event.

Separate from NotificationLog (which tracks SMS/email *dispatches*). This
table powers the bell icon + Notifications inbox for admin/driver/cashier.
Every row is also dispatched via FCM to the recipient's registered device
tokens at insert time.
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Who this notification is for: "admin" | "driver" | "cashier"
    recipient_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    recipient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    # Short keyword for the event (used by the UI for icons/colors and by the
    # Android app to route taps). E.g. "new_booking", "driver_assigned",
    # "ride_started", "contact_form", "payout_processed".
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # In-app deep link (the staff portal route) — opened when the
    # notification card is tapped.
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Optional FK-style fields to help admins filter / drill in.
    related_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    related_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
