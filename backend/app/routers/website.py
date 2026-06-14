"""
Endpoints used by the public marketing website (gobellme.com) and the matching
admin curation pages.

  Public:
    GET  /api/public/testimonials   — admin-featured ratings, lightly polished
    POST /api/public/contact        — submit the site contact form

  Admin (auth):
    GET  /api/admin/contacts
    GET  /api/admin/contacts/unread-count
    GET  /api/admin/contacts/{id}
    PUT  /api/admin/contacts/{id}/status
    PUT  /api/admin/contacts/{id}/notes
    PUT  /api/admin/reviews/{id}/feature
    PUT  /api/admin/reviews/{id}/display
"""
from datetime import datetime, timezone
from collections import defaultdict, deque
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, model_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.admin import Admin
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.rating import Rating
from app.models.contact_submission import ContactSubmission


router = APIRouter(prefix="/api", tags=["website"])


# ─────────────────────────────────────────────────────────────────
# Public — testimonials
# ─────────────────────────────────────────────────────────────────

def _polish_name(full: str) -> str:
    """Convert 'Mahtot Mekonen' → 'Mahtot M.' for privacy on the public page.
    Empty/single token returns as-is."""
    if not full:
        return ""
    parts = full.strip().split()
    if len(parts) <= 1:
        return parts[0] if parts else ""
    return f"{parts[0]} {parts[-1][0]}."


@router.get("/public/testimonials")
async def list_testimonials(db: AsyncSession = Depends(get_db)):
    """Returns admin-featured ratings shaped for the marketing site."""
    r = await db.execute(
        select(Rating, Booking, Driver)
        .join(Booking, Rating.booking_id == Booking.id)
        .join(Driver, Rating.driver_id == Driver.id)
        .where(Rating.is_featured == True)
        .order_by(Rating.created_at.desc())
        .limit(24)
    )
    out = []
    for rating, booking, driver in r.all():
        comment = (rating.display_comment_override or rating.comment or "").strip()
        if not comment:
            continue  # skip rating-only reviews on the public page
        display_name = (rating.display_name_override or _polish_name(booking.client_name)).strip() or "Anonymous"
        out.append({
            "stars": rating.rating,
            "comment": comment,
            "name": display_name,
            # Trip pickup/dropoff intentionally omitted for rider privacy.
            "driver_name": _polish_name(driver.name),
            "date": rating.created_at.date().isoformat() if rating.created_at else None,
        })
    return out


# ─────────────────────────────────────────────────────────────────
# Public — contact form
# ─────────────────────────────────────────────────────────────────

# Tiny in-process rate limiter: per-IP submissions in the last 60s.
_recent_by_ip: dict[str, deque] = defaultdict(deque)
_RATE_WINDOW = 60.0
_RATE_MAX = 3


def _rate_check(ip: str) -> bool:
    now = time.monotonic()
    q = _recent_by_ip[ip]
    while q and now - q[0] > _RATE_WINDOW:
        q.popleft()
    if len(q) >= _RATE_MAX:
        return False
    q.append(now)
    return True


class ContactRequest(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    message: str
    # Honeypot — real users leave this empty; bots fill it.
    website: str | None = None

    @model_validator(mode="after")
    def _check_email_or_phone(self):
        e = (self.email or "").strip()
        p = (self.phone or "").strip()
        if not e and not p:
            raise ValueError("Please provide either an email or a phone number so we can reach you.")
        return self


@router.post("/public/contact")
async def submit_contact(req: ContactRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Honeypot — silently accept and discard
    if (req.website or "").strip():
        return {"ok": True}

    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")
    if ip and not _rate_check(ip):
        raise HTTPException(status_code=429, detail="Too many submissions. Please try again in a minute.")

    name = (req.name or "").strip()
    email = (req.email or "").strip() or None
    phone = (req.phone or "").strip() or None
    message = (req.message or "").strip()

    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Please tell us your name.")
    if len(message) < 5:
        raise HTTPException(status_code=400, detail="Please write a short message so we know how to help.")

    sub = ContactSubmission(
        name=name[:100],
        email=email[:255] if email else None,
        phone=phone[:20] if phone else None,
        message=message[:5000],
        status="new",
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)

    # Notify every admin (in-app + FCM)
    try:
        from app.services.notifications_service import notify_all_admins
        snippet = (message or "").strip().replace("\n", " ")
        if len(snippet) > 120:
            snippet = snippet[:117] + "…"
        await notify_all_admins(
            db,
            kind="contact_form",
            title=f"New contact message from {name[:60]}",
            body=snippet or "(no message body)",
            link="/admin/contacts",
            related_type="contact_submission",
            related_id=sub.id,
        )
    except Exception as e:
        import logging
        logging.getLogger("notifications").exception(f"contact notify_all_admins failed: {e}")

    return {"ok": True}


# ─────────────────────────────────────────────────────────────────
# Admin — contact submissions
# ─────────────────────────────────────────────────────────────────

@router.get("/admin/contacts")
async def list_contacts(
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(ContactSubmission)
    if status and status != "all":
        q = q.where(ContactSubmission.status == status)

    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar() or 0

    r = await db.execute(
        q.order_by(ContactSubmission.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    items = [
        {
            "id": str(c.id),
            "name": c.name,
            "email": c.email,
            "phone": c.phone,
            "message": c.message,
            "status": c.status,
            "admin_notes": c.admin_notes,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "read_at": c.read_at.isoformat() if c.read_at else None,
            "replied_at": c.replied_at.isoformat() if c.replied_at else None,
        }
        for c in r.scalars().all()
    ]
    return {"items": items, "total": total, "page": page, "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page}


@router.get("/admin/contacts/unread-count")
async def unread_contacts_count(admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(func.count()).select_from(ContactSubmission).where(ContactSubmission.status == "new"))
    return {"count": int(r.scalar() or 0)}


class ContactStatusRequest(BaseModel):
    status: str  # 'new' | 'read' | 'replied' | 'archived'


@router.put("/admin/contacts/{contact_id}/status")
async def set_contact_status(
    contact_id: str,
    req: ContactStatusRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if req.status not in ("new", "read", "replied", "archived"):
        raise HTTPException(status_code=400, detail="Invalid status")
    r = await db.execute(select(ContactSubmission).where(ContactSubmission.id == contact_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")

    c.status = req.status
    c.handled_by = admin.id
    now = datetime.now(timezone.utc)
    if req.status == "read" and not c.read_at:
        c.read_at = now
    if req.status == "replied":
        c.replied_at = now
        if not c.read_at:
            c.read_at = now
    await db.commit()
    return {"ok": True, "status": c.status}


class ContactNotesRequest(BaseModel):
    admin_notes: str


@router.put("/admin/contacts/{contact_id}/notes")
async def set_contact_notes(
    contact_id: str,
    req: ContactNotesRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContactSubmission).where(ContactSubmission.id == contact_id))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    c.admin_notes = req.admin_notes or None
    c.handled_by = admin.id
    await db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────
# Admin — review featuring + display overrides
# ─────────────────────────────────────────────────────────────────

class FeatureRequest(BaseModel):
    is_featured: bool


@router.put("/admin/reviews/{review_id}/feature")
async def toggle_review_featured(
    review_id: str,
    req: FeatureRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(Rating).where(Rating.id == review_id))
    rating = r.scalar_one_or_none()
    if not rating:
        raise HTTPException(status_code=404, detail="Review not found")
    rating.is_featured = bool(req.is_featured)
    await db.commit()
    return {"ok": True, "is_featured": rating.is_featured}


class DisplayOverrideRequest(BaseModel):
    display_name_override: str | None = None
    display_comment_override: str | None = None


@router.put("/admin/reviews/{review_id}/display")
async def set_review_display(
    review_id: str,
    req: DisplayOverrideRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(Rating).where(Rating.id == review_id))
    rating = r.scalar_one_or_none()
    if not rating:
        raise HTTPException(status_code=404, detail="Review not found")
    rating.display_name_override = (req.display_name_override or "").strip() or None
    rating.display_comment_override = (req.display_comment_override or "").strip() or None
    await db.commit()
    return {"ok": True}
