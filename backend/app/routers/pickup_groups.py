"""
Pickup-group management (admin) + public match endpoint (clients).
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.admin import Admin
from app.models.pickup_group import PickupGroup, PickupGroupLocation
from app.services.pickup_group_service import match_groups


router = APIRouter(prefix="/api", tags=["pickup-groups"])


# ── Public ──

@router.get("/pickup-groups/match")
async def match(lat: float = Query(...), lng: float = Query(...), db: AsyncSession = Depends(get_db)):
    """Public — returns the list of groups (and their forced extras) whose
    location radius covers (lat, lng). Empty list if no match."""
    return await match_groups(db, lat, lng)


# ── Admin (auth required) ──

class GroupCreateRequest(BaseModel):
    name: str
    forced_extra_slugs: list[str] = []
    is_active: bool = True


class LocationCreateRequest(BaseModel):
    name: str
    address: str | None = None
    lat: float
    lng: float
    radius_meters: int = 500


def _serialize_loc(loc: PickupGroupLocation) -> dict:
    return {
        "id": str(loc.id),
        "name": loc.name,
        "address": loc.address,
        "lat": float(loc.lat),
        "lng": float(loc.lng),
        "radius_meters": loc.radius_meters,
        "is_active": loc.is_active,
    }


async def _serialize_group(db: AsyncSession, g: PickupGroup) -> dict:
    locs_r = await db.execute(
        select(PickupGroupLocation)
        .where(PickupGroupLocation.group_id == g.id)
        .order_by(PickupGroupLocation.name)
    )
    return {
        "id": str(g.id),
        "name": g.name,
        "forced_extra_slugs": list(g.forced_extra_slugs or []),
        "is_active": g.is_active,
        "locations": [_serialize_loc(l) for l in locs_r.scalars().all()],
    }


@router.get("/admin/pickup-groups")
async def list_groups(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(PickupGroup).order_by(PickupGroup.name))
    return [await _serialize_group(db, g) for g in r.scalars().all()]


@router.post("/admin/pickup-groups")
async def create_group(req: GroupCreateRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    g = PickupGroup(name=req.name, forced_extra_slugs=req.forced_extra_slugs, is_active=req.is_active)
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return await _serialize_group(db, g)


@router.put("/admin/pickup-groups/{group_id}")
async def update_group(group_id: str, req: GroupCreateRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(PickupGroup).where(PickupGroup.id == group_id))
    g = r.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    g.name = req.name
    g.forced_extra_slugs = req.forced_extra_slugs
    g.is_active = req.is_active
    await db.commit()
    return await _serialize_group(db, g)


@router.delete("/admin/pickup-groups/{group_id}")
async def delete_group(group_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(PickupGroup).where(PickupGroup.id == group_id))
    g = r.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.delete(g)
    await db.commit()
    return {"message": "Group deleted"}


@router.post("/admin/pickup-groups/{group_id}/locations")
async def add_location(group_id: str, req: LocationCreateRequest, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(PickupGroup).where(PickupGroup.id == group_id))
    g = r.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    loc = PickupGroupLocation(
        group_id=g.id,
        name=req.name,
        address=req.address,
        lat=req.lat,
        lng=req.lng,
        radius_meters=req.radius_meters or 500,
    )
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return _serialize_loc(loc)


@router.delete("/admin/pickup-groups/{group_id}/locations/{loc_id}")
async def delete_location(group_id: str, loc_id: str, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(PickupGroupLocation).where(
            PickupGroupLocation.id == loc_id,
            PickupGroupLocation.group_id == group_id,
        )
    )
    loc = r.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    await db.delete(loc)
    await db.commit()
    return {"message": "Location deleted"}
