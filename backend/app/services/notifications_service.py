"""High-level notifications API used by the rest of the app.

`notify(...)` is the entry point: it persists a row in `notifications` (so
the recipient sees it in their in-app inbox) AND dispatches an FCM push to
all of the recipient's registered device tokens.

Use `notify_all_admins(...)` to broadcast to every active admin.
"""
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.admin import Admin
from app.services import fcm_service

logger = logging.getLogger("notifications")


async def notify(
    db: AsyncSession,
    *,
    recipient_type: str,
    recipient_id,
    kind: str,
    title: str,
    body: str,
    link: str | None = None,
    related_type: str | None = None,
    related_id=None,
) -> Notification:
    """Persist an in-app notification AND dispatch FCM to the recipient's
    device tokens. Push failures are logged but never bubble up — the in-app
    inbox is still authoritative."""
    row = Notification(
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        kind=kind,
        title=title[:200],
        body=body,
        link=link,
        related_type=related_type,
        related_id=related_id,
    )
    db.add(row)
    await db.flush()  # populate row.id so it can ride in the FCM payload
    # Commit early so even if FCM is slow / errors the row is saved.
    await db.commit()
    await db.refresh(row)

    try:
        await fcm_service.push_to_user(
            db, recipient_type, recipient_id, title, body,
            data={
                "kind": kind,
                "notification_id": str(row.id),
                "link": link or "",
                "related_type": related_type or "",
                "related_id": str(related_id) if related_id else "",
            },
        )
    except Exception as e:
        logger.exception(f"[notifications] push for {recipient_type}:{recipient_id} failed: {e}")

    return row


async def notify_all_admins(
    db: AsyncSession,
    *,
    kind: str,
    title: str,
    body: str,
    link: str | None = None,
    related_type: str | None = None,
    related_id=None,
) -> int:
    """Insert one notification per active admin + push to each. Returns count."""
    r = await db.execute(select(Admin.id).where(Admin.is_active == True))
    ids = [row[0] for row in r.all()]
    for admin_id in ids:
        await notify(
            db,
            recipient_type="admin",
            recipient_id=admin_id,
            kind=kind, title=title, body=body, link=link,
            related_type=related_type, related_id=related_id,
        )
    return len(ids)
