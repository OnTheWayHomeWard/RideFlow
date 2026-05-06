"""
Pickup-group matching: given a (lat, lng), find which active groups contain
a location whose distance to the point is within its configured radius.
"""
import math
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pickup_group import PickupGroup, PickupGroupLocation


def _haversine_meters(lat1, lng1, lat2, lng2) -> float:
    R = 6_371_000  # Earth radius in meters
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def match_groups(db: AsyncSession, lat: float, lng: float) -> list[dict]:
    """Return a list of dicts {group_id, group_name, forced_extra_slugs}
    for every active group that has at least one active location within
    its radius of the point. Empty list if no match (or coords are 0/0)."""
    if not lat and not lng:
        return []

    rg = await db.execute(select(PickupGroup).where(PickupGroup.is_active == True))
    groups = {g.id: g for g in rg.scalars().all()}
    if not groups:
        return []

    rl = await db.execute(
        select(PickupGroupLocation).where(
            PickupGroupLocation.is_active == True,
            PickupGroupLocation.group_id.in_(list(groups.keys())),
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
        }
        for gid, g in groups.items() if gid in matched_ids
    ]


async def merge_forced_extras(db: AsyncSession, lat: float, lng: float, extra_slugs: list[str]) -> tuple[list[str], list[str]]:
    """Used at booking-creation time. Returns (final_extras, group_names) where
    final_extras is the user's extras + any forced extras from matching groups
    (deduped, order preserved with forced ones appended)."""
    matches = await match_groups(db, lat, lng)
    if not matches:
        return list(extra_slugs or []), []

    have = list(dict.fromkeys(extra_slugs or []))  # dedupe, preserve order
    group_names = []
    for m in matches:
        if m["group_name"] not in group_names:
            group_names.append(m["group_name"])
        for slug in m["forced_extra_slugs"]:
            if slug not in have:
                have.append(slug)
    return have, group_names
