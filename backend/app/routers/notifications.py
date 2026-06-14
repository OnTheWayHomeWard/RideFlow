"""Notifications router — FCM token registration + in-app inbox.

All endpoints accept a JWT from any staff role (admin/driver/cashier). The
user is resolved via `get_any_authenticated_user`.

Endpoints:
  POST   /api/notifications/register-fcm     Upsert an FCM token
  DELETE /api/notifications/fcm              Remove an FCM token (logout)
  GET    /api/notifications                  Paginated inbox for current user
  GET    /api/notifications/unread-count     For the bell badge
  PUT    /api/notifications/{id}/read        Mark one as read
  PUT    /api/notifications/read-all         Mark all as read
  POST   /api/notifications/test-push        DEV — send a test push to self
"""
from datetime import datetime, timezone
from math import ceil
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_any_authenticated_user
from app.models.fcm_token import FcmToken
from app.models.notification import Notification
from app.services import fcm_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ─── Request bodies ────────────────────────────────────────────────────

class RegisterFcmRequest(BaseModel):
    token: str
    user_agent: str | None = None


class DeleteFcmRequest(BaseModel):
    token: str


class TestPushRequest(BaseModel):
    title: str = "Test notification"
    body: str = "This is a test push from the staff portal."


# ─── FCM token management ──────────────────────────────────────────────

@router.post("/register-fcm")
async def register_fcm(
    req: RegisterFcmRequest,
    user=Depends(get_any_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Register/upsert an FCM token for the current user. The Android app
    should call this right after login (and again whenever the FCM SDK
    rotates the token)."""
    if not req.token or not req.token.strip():
        raise HTTPException(status_code=400, detail="token is required")
    row = await fcm_service.register_token(
        db, user["role"], user["id"], req.token.strip(), req.user_agent,
    )
    return {"id": str(row.id), "registered": True}


@router.delete("/fcm")
async def delete_fcm(
    req: DeleteFcmRequest,
    user=Depends(get_any_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an FCM token for the current user (called at logout)."""
    count = await fcm_service.delete_token(db, user["role"], user["id"], req.token)
    return {"deleted": count}


# ─── In-app inbox ──────────────────────────────────────────────────────

def _serialize(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "kind": n.kind,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "related_type": n.related_type,
        "related_id": str(n.related_id) if n.related_id else None,
        "is_read": n.is_read,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    user=Depends(get_any_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated inbox, newest first."""
    base_q = select(Notification).where(
        Notification.recipient_type == user["role"],
        Notification.recipient_id == user["id"],
    )
    if unread_only:
        base_q = base_q.where(Notification.is_read == False)

    total_r = await db.execute(
        select(func.count()).select_from(base_q.subquery())
    )
    total = total_r.scalar_one()

    rows_r = await db.execute(
        base_q.order_by(Notification.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    notifications = [_serialize(n) for n in rows_r.scalars().all()]

    return {
        "notifications": notifications,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, ceil(total / per_page)) if total else 0,
    }


@router.get("/unread-count")
async def unread_count(
    user=Depends(get_any_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.recipient_type == user["role"],
            Notification.recipient_id == user["id"],
            Notification.is_read == False,
        )
    )
    return {"count": r.scalar_one()}


@router.put("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user=Depends(get_any_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        nid = UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification id")
    r = await db.execute(select(Notification).where(Notification.id == nid))
    n = r.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if n.recipient_type != user["role"] or n.recipient_id != user["id"]:
        raise HTTPException(status_code=403, detail="Not your notification")
    if not n.is_read:
        n.is_read = True
        n.read_at = datetime.now(timezone.utc)
        await db.commit()
    return {"id": str(n.id), "is_read": True}


@router.put("/read-all")
async def mark_all_read(
    user=Depends(get_any_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        update(Notification)
        .where(
            Notification.recipient_type == user["role"],
            Notification.recipient_id == user["id"],
            Notification.is_read == False,
        )
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"marked_read": res.rowcount or 0}


# ─── Dev: test push ────────────────────────────────────────────────────

@router.post("/test-push")
async def test_push(
    req: TestPushRequest,
    user=Depends(get_any_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Push a test notification to the current user's registered tokens.
    Useful to verify the Firebase setup end-to-end after deploy."""
    result = await fcm_service.push_to_user(
        db, user["role"], user["id"], req.title, req.body,
        data={"kind": "test", "link": ""},
    )
    return result
