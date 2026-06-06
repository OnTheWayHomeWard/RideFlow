"""Business timezone helpers.

We operate in a single timezone (configurable via the business_timezone
Setting; default America/New_York). Pickup wall-clock times — pickup_date,
pickup_time — are stored exactly as the rider chose them and are compared
against `now()` in this timezone. System audit timestamps (created_at,
paid_at, started_at, etc.) remain UTC.
"""
from datetime import datetime, date as _date, time as _time
from zoneinfo import ZoneInfo
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


DEFAULT_TZ_NAME = "America/New_York"


async def get_business_tz_name(db: AsyncSession) -> str:
    """Return the configured business timezone name (IANA, e.g. 'America/New_York').
    Falls back to the Eastern default if the Setting is unset or invalid."""
    from app.models.setting import Setting
    r = await db.execute(select(Setting).where(Setting.key == "business_timezone"))
    s = r.scalar_one_or_none()
    if not s or not s.value:
        return DEFAULT_TZ_NAME
    name = str(s.value).strip()
    try:
        ZoneInfo(name)
        return name
    except Exception:
        return DEFAULT_TZ_NAME


async def get_business_tz(db: AsyncSession) -> ZoneInfo:
    """Same as get_business_tz_name but returns a ready-to-use ZoneInfo."""
    return ZoneInfo(await get_business_tz_name(db))


async def business_now(db: AsyncSession) -> datetime:
    """Current time in the business timezone (tz-aware)."""
    return datetime.now(await get_business_tz(db))


async def combine_in_business_tz(db: AsyncSession, d: _date, t: _time) -> datetime:
    """Combine a date + time and tag it as the business timezone — i.e.
    the wall-clock pickup time the rider chose."""
    return datetime.combine(d, t, tzinfo=await get_business_tz(db))
