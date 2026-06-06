"""Dropoff-group matching — mirrors pickup_group_service but evaluates against
the booking's dropoff coordinates."""
import math
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dropoff_group import DropoffGroup, DropoffGroupLocation


def _haversine_meters(lat1, lng1, lat2, lng2) -> float:
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def match_groups(db: AsyncSession, lat: float, lng: float) -> list[dict]:
    """Return a list of dicts {group_id, group_name, forced_extra_slugs, surcharge_amount}
    for every active dropoff group that has at least one active location within
    its radius of the point. Empty list if no match (or coords are 0/0)."""
    if not lat and not lng:
        return []

    rg = await db.execute(select(DropoffGroup).where(DropoffGroup.is_active == True))
    groups = {g.id: g for g in rg.scalars().all()}
    if not groups:
        return []

    rl = await db.execute(
        select(DropoffGroupLocation).where(
            DropoffGroupLocation.is_active == True,
            DropoffGroupLocation.group_id.in_(list(groups.keys())),
        )
    )

    matched_ids = set()
    for loc in rl.scalars().all():
        d = _haversine_meters(float(loc.lat), float(loc.lng), float(lat), float(lng))
        if d <= float(loc.radius_meters):
            matched_ids.add(loc.group_id)

    return [
        {
            "group_id": str(g.id),
            "group_name": g.name,
            "forced_extra_slugs": list(g.forced_extra_slugs or []),
            "surcharge_amount": float(g.surcharge_amount or 0),
        }
        for gid, g in groups.items() if gid in matched_ids
    ]


async def merge_forced_extras(db: AsyncSession, lat: float, lng: float, extra_slugs: list[str]) -> tuple[list[str], list[str], float]:
    """Same shape as pickup_group_service.merge_forced_extras. Returns
    (final_extras, group_names, total_surcharge)."""
    matches = await match_groups(db, lat, lng)
    if not matches:
        return list(extra_slugs or []), [], 0.0

    have = list(dict.fromkeys(extra_slugs or []))
    group_names = []
    total_surcharge = 0.0
    for m in matches:
        if m["group_name"] not in group_names:
            group_names.append(m["group_name"])
        for slug in m["forced_extra_slugs"]:
            if slug not in have:
                have.append(slug)
        total_surcharge += float(m.get("surcharge_amount") or 0)
    return have, group_names, total_surcharge
