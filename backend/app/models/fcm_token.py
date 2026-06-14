"""Firebase Cloud Messaging device tokens, attached to a staff user.

One row per device — a single admin/driver/cashier can have many tokens
(phone, tablet, secondary device). The Android app POSTs the token to
/api/notifications/register-fcm after login.
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class FcmToken(Base):
    __tablename__ = "fcm_tokens"
    __table_args__ = (UniqueConstraint("token", name="uq_fcm_tokens_token"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # "admin" | "driver" | "cashier"
    owner_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    token: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
