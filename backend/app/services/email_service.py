"""Resend-backed transactional email dispatcher.

Reads its config from the `settings` table at send time so admins can rotate
the API key or change the From address without redeploying. If
`email_enabled` is false, or the API key / from email are missing, sending
becomes a logged no-op (we still write a `notification_log` row with
status='disabled' for auditability).

Public entry points:
  - send_email(db, to, subject, html, text=None, related_type=None, related_id=None)
  - notify_client_booking_email(db, booking, settings, confirmation_url)
  - notify_client_cancellation_email(db, booking, settings, refund_amount, refund_currency)
"""
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import Setting
from app.models.notification_log import NotificationLog

logger = logging.getLogger("email")


async def _read_settings(db: AsyncSession) -> dict:
    """Pull the email-related settings into a small dict — one query."""
    keys = ("email_enabled", "resend_api_key", "resend_from_email", "resend_from_name")
    r = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    out = {s.key: s.value for s in r.scalars().all()}
    return {
        "enabled": str(out.get("email_enabled", "false")).lower() in ("true", "1", "yes"),
        "api_key": (out.get("resend_api_key") or "").strip(),
        "from_email": (out.get("resend_from_email") or "").strip(),
        "from_name": (out.get("resend_from_name") or "").strip(),
    }


def _build_from(cfg: dict) -> str:
    """Format as 'Name <email>' if name is set, else just the email."""
    fe = cfg["from_email"]
    if cfg["from_name"]:
        return f"{cfg['from_name']} <{fe}>"
    return fe


async def send_email(
    db: AsyncSession,
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    related_type: str | None = None,
    related_id: str | None = None,
) -> dict:
    """Send a transactional email via Resend. Returns
    {sent: bool, disabled: bool, error: str|None, resend_id: str|None}.
    Always logs a notification_log row regardless of outcome."""
    cfg = await _read_settings(db)

    # Pre-write the log row so we capture an audit trail even on hard errors.
    log = NotificationLog(
        recipient=(to or "")[:50],
        channel="email",
        message=f"{subject} — {(text or html)[:200]}",
        status="sent",
        related_type=related_type,
        related_id=related_id,
    )

    if not cfg["enabled"] or not cfg["api_key"] or not cfg["from_email"]:
        log.status = "disabled"
        db.add(log)
        await db.commit()
        logger.info(f"[email] disabled — not sending to {to}")
        return {"sent": False, "disabled": True, "error": None, "resend_id": None}

    if not to or "@" not in to:
        log.status = "failed"
        log.message = f"invalid recipient: {to!r}"
        db.add(log)
        await db.commit()
        return {"sent": False, "disabled": False, "error": "invalid recipient", "resend_id": None}

    try:
        import resend
        resend.api_key = cfg["api_key"]
        params = {
            "from": _build_from(cfg),
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            params["text"] = text
        res = resend.Emails.send(params)
        resend_id = (res or {}).get("id") if isinstance(res, dict) else getattr(res, "id", None)
        log.status = "delivered"
        db.add(log)
        await db.commit()
        return {"sent": True, "disabled": False, "error": None, "resend_id": resend_id}
    except Exception as e:
        log.status = "failed"
        log.message = f"resend error: {e}"[:1000]
        db.add(log)
        await db.commit()
        logger.exception(f"[email] send to {to} failed: {e}")
        return {"sent": False, "disabled": False, "error": str(e), "resend_id": None}


# ─── Templates ──────────────────────────────────────────────────────────

def _brand_block(brand: str, logo_url: str | None) -> str:
    if logo_url:
        return f'<img src="{logo_url}" alt="{brand}" style="height:36px"/>'
    return f'<h2 style="margin:0;color:#0f172a;">{brand}</h2>'


async def notify_client_booking_email(
    db: AsyncSession, booking, confirmation_url: str,
) -> dict:
    """Send the booking-confirmation email to the rider."""
    if not booking.client_email:
        return {"sent": False, "disabled": False, "error": "no email on booking", "resend_id": None}
    # Resolve brand bits from settings for a nicer header
    r = await db.execute(select(Setting).where(Setting.key.in_(["company_name", "company_logo_url"])))
    s = {row.key: row.value for row in r.scalars().all()}
    brand = (s.get("company_name") or "GoBellMe")
    logo = (s.get("company_logo_url") or None)
    name = booking.client_name or "there"
    subject = f"Booking confirmed — {booking.booking_number}"
    text = (
        f"Hi {name},\n\n"
        f"Your ride is booked.\n\n"
        f"Booking: {booking.booking_number}\n"
        f"Pickup:  {booking.pickup_name}\n"
        f"Drop-off: {booking.dropoff_name}\n"
        f"When:    {booking.pickup_date} {str(booking.pickup_time)[:5]} (Eastern Time)\n"
        f"Total:   ${booking.total_amount}\n\n"
        f"View your receipt: {confirmation_url}\n\n"
        f"— {brand}\n"
    )
    html = f"""\
<!doctype html><html><body style="font-family:-apple-system,system-ui,Segoe UI,Roboto,Inter,sans-serif;background:#f8fafc;padding:20px;margin:0;">
  <table align="center" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <tr><td style="padding-bottom:16px;border-bottom:1px solid #e2e8f0;">{_brand_block(brand, logo)}</td></tr>
    <tr><td style="padding-top:20px;">
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 8px 0;">Your ride is booked!</h1>
      <p style="color:#475569;margin:0 0 20px 0;">Hi {name}, here are the details.</p>
      <table cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;color:#0f172a;font-size:14px;">
        <tr><td style="color:#64748b;width:32%;">Booking #</td><td><b>{booking.booking_number}</b></td></tr>
        <tr><td style="color:#64748b;">Pickup</td><td>{booking.pickup_name}</td></tr>
        <tr><td style="color:#64748b;">Drop-off</td><td>{booking.dropoff_name}</td></tr>
        <tr><td style="color:#64748b;">When</td><td>{booking.pickup_date} {str(booking.pickup_time)[:5]} <span style="color:#94a3b8">(Eastern Time)</span></td></tr>
        <tr><td style="color:#64748b;">Total paid</td><td><b>${booking.total_amount}</b></td></tr>
      </table>
      <p style="margin-top:24px;">
        <a href="{confirmation_url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">View your receipt</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
        Need to cancel? Open your receipt — you can self-cancel up to the configured window before pickup.
      </p>
    </td></tr>
  </table>
</body></html>"""
    return await send_email(
        db, booking.client_email, subject, html, text=text,
        related_type="booking", related_id=str(booking.id),
    )


async def notify_guest_payment_link_email(
    db: AsyncSession, to_email: str, variables: dict, booking,
) -> dict:
    """Send the payment-link email when a cashier books for a guest.

    Subject line is settings-driven (`email_guest_payment_link_subject`) so
    admins can tweak it without a redeploy — same template vars as the SMS
    counterpart. The body renders a big Pay-Now CTA plus a plaintext fallback
    for clients that don't render HTML."""
    if not to_email:
        return {"sent": False, "disabled": False, "error": "no email", "resend_id": None}

    # Brand + subject template — read together in one query.
    r = await db.execute(
        select(Setting).where(
            Setting.key.in_([
                "company_name", "company_logo_url",
                "email_guest_payment_link_subject",
            ])
        )
    )
    s = {row.key: row.value for row in r.scalars().all()}
    brand = (s.get("company_name") or "GoBellMe")
    logo = (s.get("company_logo_url") or None)
    subject_tpl = (
        s.get("email_guest_payment_link_subject")
        or "Complete your ride reservation — {booking_number}"
    )
    try:
        subject = subject_tpl.format(**variables)
    except Exception:
        # Broken template shouldn't kill the send — fall back to a safe default.
        subject = f"Complete your ride reservation — {variables.get('booking_number', '')}"

    name = variables.get("client_name") or "there"
    text = (
        f"Hi {name},\n\n"
        f"A ride has been reserved for you by {(variables.get('cashier_name') or variables.get('hotel_name') or '')}.\n\n"
        f"Pickup:  {variables.get('pickup_name', '')}\n"
        f"Drop-off: {variables.get('dropoff_name', '')}\n"
        f"When:    {variables.get('pickup_date', '')} {variables.get('pickup_time', '')}\n"
        f"Total:   ${variables.get('total_amount', '')}\n\n"
        f"Complete your payment here: {variables.get('payment_url', '')}\n\n"
        f"— {brand}\n"
    )
    html = f"""\
<!doctype html><html><body style="font-family:-apple-system,system-ui,Segoe UI,Roboto,Inter,sans-serif;background:#f8fafc;padding:20px;margin:0;">
  <table align="center" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <tr><td style="padding-bottom:16px;border-bottom:1px solid #e2e8f0;">{_brand_block(brand, logo)}</td></tr>
    <tr><td style="padding-top:20px;">
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 8px 0;">Complete your ride reservation</h1>
      <p style="color:#475569;margin:0 0 20px 0;">
        Hi {name}, {(variables.get('cashier_name') or variables.get('hotel_name') or '')} reserved a ride for you. Review the details and complete the payment to confirm.
      </p>
      <table cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;color:#0f172a;font-size:14px;">
        <tr><td style="color:#64748b;width:32%;">Booking #</td><td><b>{variables.get('booking_number', '')}</b></td></tr>
        <tr><td style="color:#64748b;">Pickup</td><td>{variables.get('pickup_name', '')}</td></tr>
        <tr><td style="color:#64748b;">Drop-off</td><td>{variables.get('dropoff_name', '')}</td></tr>
        <tr><td style="color:#64748b;">When</td><td>{variables.get('pickup_date', '')} {variables.get('pickup_time', '')}</td></tr>
        <tr><td style="color:#64748b;">Total</td><td><b>${variables.get('total_amount', '')}</b></td></tr>
      </table>
      <p style="margin-top:24px;">
        <a href="{variables.get('payment_url', '')}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Pay ${variables.get('total_amount', '')}</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
        This link is unique to your reservation. If you didn't request this ride, you can ignore this email.
      </p>
    </td></tr>
  </table>
</body></html>"""
    return await send_email(
        db, to_email, subject, html, text=text,
        related_type="booking", related_id=str(booking.id),
    )


async def notify_client_cancellation_email(
    db: AsyncSession, booking, refund_amount: float, currency: str = "usd",
) -> dict:
    """Send the cancellation + refund-confirmed email."""
    if not booking.client_email:
        return {"sent": False, "disabled": False, "error": "no email on booking", "resend_id": None}
    r = await db.execute(select(Setting).where(Setting.key.in_(["company_name", "company_logo_url"])))
    s = {row.key: row.value for row in r.scalars().all()}
    brand = (s.get("company_name") or "GoBellMe")
    logo = (s.get("company_logo_url") or None)
    name = booking.client_name or "there"
    subject = f"Booking {booking.booking_number} cancelled — refund processed"
    text = (
        f"Hi {name},\n\n"
        f"Your booking {booking.booking_number} has been cancelled and a refund of "
        f"{currency.upper()} {refund_amount:.2f} has been issued. It typically takes "
        f"5–10 business days to appear on your statement.\n\n"
        f"— {brand}\n"
    )
    html = f"""\
<!doctype html><html><body style="font-family:-apple-system,system-ui,Segoe UI,Roboto,Inter,sans-serif;background:#f8fafc;padding:20px;margin:0;">
  <table align="center" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <tr><td style="padding-bottom:16px;border-bottom:1px solid #e2e8f0;">{_brand_block(brand, logo)}</td></tr>
    <tr><td style="padding-top:20px;">
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 8px 0;">Booking cancelled</h1>
      <p style="color:#475569;margin:0 0 20px 0;">Hi {name}, your booking <b>{booking.booking_number}</b> has been cancelled.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;">
        <p style="margin:0;color:#166534;"><b>Refund:</b> ${refund_amount:.2f} ({currency.upper()}) has been issued.</p>
        <p style="margin:6px 0 0 0;color:#15803d;font-size:13px;">It usually appears on your statement within 5–10 business days.</p>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">If you didn't request this cancellation, reply to this email and we'll look into it.</p>
    </td></tr>
  </table>
</body></html>"""
    return await send_email(
        db, booking.client_email, subject, html, text=text,
        related_type="booking", related_id=str(booking.id),
    )
