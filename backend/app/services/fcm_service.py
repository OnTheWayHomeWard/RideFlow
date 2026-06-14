"""Firebase Cloud Messaging dispatcher.

Initializes Firebase Admin lazily from FIREBASE_CREDENTIALS_PATH; if the path
is missing or invalid, push becomes a logged no-op so the rest of the
notification flow (DB row insert + in-app inbox) keeps working.

Public entry points:
  - register_token(db, owner_type, owner_id, token, user_agent=None) -> FcmToken
  - delete_token(db, owner_type, owner_id, token)
  - push_to_user(db, owner_type, owner_id, title, body, data=None)
"""
import os
import logging
from datetime import datetime, timezone

from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fcm_token import FcmToken

logger = logging.getLogger("fcm")

_FIREBASE_INITIALIZED = False
_FIREBASE_AVAILABLE = False


def _init_firebase():
    """Initialize Firebase Admin once per process. Safe to call repeatedly.

    If FIREBASE_CREDENTIALS_PATH isn't set or the file is missing, marks the
    service as unavailable — push becomes a no-op."""
    global _FIREBASE_INITIALIZED, _FIREBASE_AVAILABLE
    if _FIREBASE_INITIALIZED:
        return _FIREBASE_AVAILABLE
    _FIREBASE_INITIALIZED = True

    creds_path = os.environ.get("FIREBASE_CREDENTIALS_PATH", "").strip()
    if not creds_path:
        logger.info("[fcm] FIREBASE_CREDENTIALS_PATH not set — push disabled (in-app inbox still works)")
        return False
    if not os.path.isfile(creds_path):
        logger.warning(f"[fcm] credentials file not found at {creds_path} — push disabled")
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials
        cred = credentials.Certificate(creds_path)
        # If the app is already initialized (e.g. uvicorn reload), don't redo it.
        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app(cred)
        _FIREBASE_AVAILABLE = True
        logger.info("[fcm] Firebase Admin initialized")
    except Exception as e:
        logger.exception(f"[fcm] Firebase init failed: {e}")
        _FIREBASE_AVAILABLE = False
    return _FIREBASE_AVAILABLE


async def register_token(
    db: AsyncSession, owner_type: str, owner_id, token: str, user_agent: str | None = None,
) -> FcmToken:
    """Upsert an FCM token. If the same token already exists, reassign it to
    the current user (handles a single device switching accounts)."""
    if not token:
        raise ValueError("token is required")
    r = await db.execute(select(FcmToken).where(FcmToken.token == token))
    existing = r.scalar_one_or_none()
    if existing:
        existing.owner_type = owner_type
        existing.owner_id = owner_id
        existing.is_active = True
        existing.user_agent = user_agent or existing.user_agent
        existing.last_used_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing

    row = FcmToken(
        owner_type=owner_type,
        owner_id=owner_id,
        token=token,
        user_agent=user_agent,
        is_active=True,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def delete_token(db: AsyncSession, owner_type: str, owner_id, token: str) -> int:
    """Remove a token. Returns the number of rows deleted (0 or 1)."""
    res = await db.execute(
        delete(FcmToken).where(
            FcmToken.token == token,
            FcmToken.owner_type == owner_type,
            FcmToken.owner_id == owner_id,
        )
    )
    await db.commit()
    return res.rowcount or 0


async def _active_tokens_for(db: AsyncSession, owner_type: str, owner_id) -> list[FcmToken]:
    r = await db.execute(
        select(FcmToken).where(
            FcmToken.owner_type == owner_type,
            FcmToken.owner_id == owner_id,
            FcmToken.is_active == True,
        )
    )
    return list(r.scalars().all())


async def push_to_user(
    db: AsyncSession, owner_type: str, owner_id, title: str, body: str, data: dict | None = None,
) -> dict:
    """Send an FCM message to every active token belonging to (owner_type, owner_id).

    Returns a small dict with counts: {sent, failed, no_tokens, disabled}.
    Tokens that Firebase rejects as invalid/expired are deactivated so we
    don't keep hitting them."""
    tokens = await _active_tokens_for(db, owner_type, owner_id)
    if not tokens:
        return {"sent": 0, "failed": 0, "no_tokens": True, "disabled": False}

    if not _init_firebase():
        # Push disabled (no credentials) — return cleanly so the caller still
        # gets the in-app notification row.
        return {"sent": 0, "failed": 0, "no_tokens": False, "disabled": True}

    from firebase_admin import messaging

    payload_data = {k: str(v) for k, v in (data or {}).items()}

    message = messaging.MulticastMessage(
        tokens=[t.token for t in tokens],
        notification=messaging.Notification(title=title, body=body),
        data=payload_data,
        android=messaging.AndroidConfig(priority="high"),
    )

    try:
        resp = messaging.send_each_for_multicast(message)
    except Exception as e:
        logger.exception(f"[fcm] send failed for {owner_type}:{owner_id}: {e}")
        return {"sent": 0, "failed": len(tokens), "no_tokens": False, "disabled": False}

    dead_tokens: list[str] = []
    for i, r in enumerate(resp.responses):
        if r.success:
            continue
        err = r.exception
        # Firebase docs: "registration-token-not-registered" / "invalid-argument"
        # / "messaging/registration-token-not-registered" → token is dead.
        code = getattr(err, "code", "") or ""
        if "not-registered" in str(code).lower() or "registration-token-not-registered" in str(err).lower():
            dead_tokens.append(tokens[i].token)

    if dead_tokens:
        await db.execute(
            update(FcmToken).where(FcmToken.token.in_(dead_tokens)).values(is_active=False)
        )
        await db.commit()

    return {
        "sent": resp.success_count,
        "failed": resp.failure_count,
        "no_tokens": False,
        "disabled": False,
    }
