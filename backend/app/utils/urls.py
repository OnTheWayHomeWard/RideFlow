"""Resolve public-facing base URLs from the settings table.
Used everywhere we need to generate a link sent off-platform (SMS, Stripe redirect, QR).
Falls back to localhost for dev if the setting isn't present.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import Setting


async def _get(db: AsyncSession, key: str, default: str) -> str:
    r = await db.execute(select(Setting).where(Setting.key == key))
    s = r.scalar_one_or_none()
    val = str(s.value) if s and s.value else default
    return val.rstrip("/")


async def get_client_base_url(db: AsyncSession) -> str:
    """Public URL of the client booking app (e.g. https://ride.gobellme.com)."""
    return await _get(db, "client_base_url", "http://localhost:5173")


async def get_staff_base_url(db: AsyncSession) -> str:
    """Public URL of the unified staff portal (e.g. https://staff.gobellme.com)."""
    return await _get(db, "staff_base_url", "http://localhost:5174")
