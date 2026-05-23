"""
SMS Notification Service — sends templated messages to cashiers, drivers, and clients.
Templates are stored in the settings table and support variable interpolation.

Variables: {cashier_name}, {driver_name}, {client_name}, {amount}, {route},
           {booking_number}, {total_earnings}, {pickup_date}, {pickup_time}
"""
import re
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.models.setting import Setting
from app.models.notification_log import NotificationLog
from sqlalchemy import select


async def get_template(db: AsyncSession, key: str) -> str:
    """Get an SMS template from settings."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        return str(setting.value)
    return ""


# Common non-GSM punctuation → GSM-7 safe equivalents. A single non-GSM char
# forces the whole SMS into UCS2 (70 chars/segment instead of 160), which
# multiplies cost and hurts international deliverability. We can't fix genuinely
# non-Latin content (e.g. Amharic place names), but we can stop fancy punctuation
# from silently bloating every message.
_GSM_REPLACEMENTS = {
    "→": "->",   # → arrow
    "←": "<-",   # ←
    "↔": "<->",  # ↔
    "–": "-",    # – en dash
    "—": "-",    # — em dash
    "‘": "'", "’": "'",   # ' ' smart single quotes
    "“": '"', "”": '"',   # " " smart double quotes
    "…": "...",  # … ellipsis
    "•": "*",    # • bullet
    " ": " ",    # non-breaking space
    "€": "EUR",  # € (not in GSM default unless using extension)
}


def to_gsm_safe(text: str) -> str:
    if not text:
        return text
    for bad, good in _GSM_REPLACEMENTS.items():
        text = text.replace(bad, good)
    return text


# Strip a leading Plus Code like "2QJR+85, " from a place string.
_PLUS_CODE_RE = re.compile(r'^[A-Z0-9]{4,}\+[A-Z0-9]+,?\s*', re.I)


def short_place(name) -> str:
    """Turn a long formatted address into a short label for SMS.
    'Bole ... Airport, Addis Ababa, Ethiopia' -> 'Bole ... Airport'.
    Drops a leading Plus Code, then keeps the text before the first comma."""
    if not name:
        return name
    s = _PLUS_CODE_RE.sub('', str(name)).strip()
    first = s.split(',')[0].strip()
    return first or s or str(name)


def _short_route(route: str) -> str:
    """Shorten both endpoints of a 'A -> B' / 'A → B' route string."""
    parts = re.split(r'\s*(?:->|→)\s*', str(route), maxsplit=1)
    if len(parts) == 2:
        return f"{short_place(parts[0])} -> {short_place(parts[1])}"
    return short_place(route)


# Variables that hold place names — shortened automatically in SMS so messages
# stay compact (and ideally single-segment). Full addresses remain on the
# receipt/confirmation page.
_PLACE_KEYS = {"pickup_name", "dropoff_name"}


def render_template(template: str, variables: dict) -> str:
    """Replace {variable} placeholders with actual values, shortening place names."""
    message = template
    for key, value in variables.items():
        v = str(value)
        if key in _PLACE_KEYS:
            v = short_place(v)
        elif key == "route":
            v = _short_route(v)
        message = message.replace(f"{{{key}}}", v)
    return message


async def send_sms(db: AsyncSession, to: str, message: str, related_type: str = None, related_id: str = None):
    """
    Send an SMS message. In dev mode, just logs it. In production, uses Twilio.
    Always logs to notification_log table.
    """
    # Normalize fancy punctuation to keep the message in GSM-7 where possible
    # (cheaper, more reliable internationally than UCS2).
    message = to_gsm_safe(message)
    # Check if SMS is enabled (before adding log to avoid autoflush issues)
    sms_enabled_r = await db.execute(select(Setting).where(Setting.key == "sms_enabled"))
    sms_setting = sms_enabled_r.scalar_one_or_none()
    sms_enabled = not (sms_setting and not sms_setting.value)

    # Log the notification (defensive truncation in case the DB column is narrower than expected)
    log = NotificationLog(
        recipient=(to or "")[:20],
        channel="sms",
        message=message,
        status="sent" if sms_enabled else "disabled",
        related_type=(related_type or None) if related_type is None else related_type[:50],
        related_id=related_id,
    )
    db.add(log)

    if not sms_enabled:
        return

    # Dev mode — just print
    if not app_settings.TWILIO_ACCOUNT_SID or app_settings.TWILIO_ACCOUNT_SID == "placeholder":
        print(f"[SMS DEV] To: {to} | Message: {message}")
        return

    # Production — send via Twilio.
    # Prefer the campaign-linked Messaging Service (required for reliable US
    # A2P 10DLC delivery); fall back to the raw sender number if not set.
    try:
        from twilio.rest import Client
        client = Client(app_settings.TWILIO_ACCOUNT_SID, app_settings.TWILIO_AUTH_TOKEN)
        kwargs = {"body": message, "to": to}
        if app_settings.TWILIO_MESSAGING_SERVICE_SID:
            kwargs["messaging_service_sid"] = app_settings.TWILIO_MESSAGING_SERVICE_SID
        else:
            kwargs["from_"] = app_settings.TWILIO_PHONE_NUMBER
        client.messages.create(**kwargs)
        log.status = "delivered"
    except Exception as e:
        # e.g. 21610 = recipient previously replied STOP (opted out). Don't crash.
        log.status = "failed"
        print(f"[SMS ERROR] {e}")


async def notify_cashier_referral(db: AsyncSession, cashier_phone: str, variables: dict):
    """Notify cashier when a booking comes through their QR code."""
    template = await get_template(db, "sms_cashier_referral")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, cashier_phone, message, "cashier_referral")


async def notify_cashier_payout(db: AsyncSession, cashier_phone: str, variables: dict):
    """Notify cashier when their commission is processed."""
    template = await get_template(db, "sms_cashier_payout")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, cashier_phone, message, "cashier_payout")


async def notify_client_booking(db: AsyncSession, client_phone: str, variables: dict):
    """Notify client after successful booking with confirmation link."""
    template = await get_template(db, "sms_client_booking")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, client_phone, message, "client_booking")


async def notify_client_ride_completed(db: AsyncSession, client_phone: str, variables: dict):
    """Notify client when their ride is completed — thanks + rating link."""
    template = await get_template(db, "sms_client_ride_completed")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, client_phone, message, "client_ride_completed")


async def notify_client_ride_started(db: AsyncSession, client_phone: str, variables: dict):
    """Notify client when ride starts with rating link."""
    template = await get_template(db, "sms_client_ride_started")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, client_phone, message, "client_ride_started")


async def notify_guest_payment_link(db: AsyncSession, guest_phone: str, variables: dict):
    """Send payment link to guest when cashier books on their behalf."""
    template = await get_template(db, "sms_guest_payment_link")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, guest_phone, message, "guest_payment_link")


async def notify_driver_new_run(db: AsyncSession, driver_phone: str, variables: dict):
    """Notify driver when a new run is assigned to them."""
    template = await get_template(db, "sms_driver_new_run")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, driver_phone, message, "driver_new_run")


async def notify_driver_ride_completed(db: AsyncSession, driver_phone: str, variables: dict):
    """Notify driver when ride is completed with earnings info."""
    template = await get_template(db, "sms_driver_ride_completed")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, driver_phone, message, "driver_ride_completed")


async def notify_driver_payout_released(db: AsyncSession, driver_phone: str, variables: dict):
    """Notify driver when their payout is released."""
    template = await get_template(db, "sms_driver_payout_released")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, driver_phone, message, "driver_payout_released")


async def notify_driver_payout_flagged(db: AsyncSession, driver_phone: str, variables: dict):
    """Notify driver when their payout is flagged for review."""
    template = await get_template(db, "sms_driver_payout_flagged")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, driver_phone, message, "driver_payout_flagged")


async def notify_driver_payout_rejected(db: AsyncSession, driver_phone: str, variables: dict):
    """Notify driver when their payout is rejected."""
    template = await get_template(db, "sms_driver_payout_rejected")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, driver_phone, message, "driver_payout_rejected")


async def notify_concierge_payout(db: AsyncSession, phone: str, variables: dict):
    template = await get_template(db, "sms_concierge_payout")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, phone, message, "concierge_payout")


async def notify_client_reminder(db: AsyncSession, client_phone: str, variables: dict):
    """Pre-ride reminder to client (X hours before)."""
    template = await get_template(db, "sms_client_reminder")
    if not template:
        return
    await send_sms(db, client_phone, render_template(template, variables), "client_reminder")


async def notify_client_final_reminder(db: AsyncSession, client_phone: str, variables: dict):
    """Final 'starting soon' reminder to client (X minutes before)."""
    template = await get_template(db, "sms_client_final_reminder")
    if not template:
        return
    await send_sms(db, client_phone, render_template(template, variables), "client_final_reminder")


async def notify_driver_reminder(db: AsyncSession, driver_phone: str, variables: dict):
    """Pre-ride reminder to driver (X hours before)."""
    template = await get_template(db, "sms_driver_reminder")
    if not template:
        return
    await send_sms(db, driver_phone, render_template(template, variables), "driver_reminder")


async def notify_driver_on_way(db: AsyncSession, client_phone: str, variables: dict):
    """Driver tapped 'On my way' — notify client."""
    template = await get_template(db, "sms_driver_on_way")
    if not template:
        return
    await send_sms(db, client_phone, render_template(template, variables), "driver_on_way")


async def notify_driver_arrived(db: AsyncSession, client_phone: str, variables: dict):
    """Driver tapped 'I've arrived' — notify client."""
    template = await get_template(db, "sms_driver_arrived")
    if not template:
        return
    await send_sms(db, client_phone, render_template(template, variables), "driver_arrived")


async def notify_concierge_batch_link(db: AsyncSession, phone: str, variables: dict):
    template = await get_template(db, "sms_concierge_batch_link")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, phone, message, "concierge_batch_link")


async def notify_client_refund(db: AsyncSession, phone: str, variables: dict):
    template = await get_template(db, "sms_client_refund")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, phone, message, "client_refund")


async def notify_cashier_paid_via_concierge(db: AsyncSession, phone: str, variables: dict):
    template = await get_template(db, "sms_cashier_paid_via_concierge")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, phone, message, "cashier_paid_via_concierge")


async def notify_driver_batch_payout(db: AsyncSession, phone: str, variables: dict):
    template = await get_template(db, "sms_driver_batch_payout")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, phone, message, "driver_batch_payout")


async def notify_driver_run_cancelled(db: AsyncSession, phone: str, variables: dict):
    template = await get_template(db, "sms_driver_run_cancelled")
    if not template:
        return
    message = render_template(template, variables)
    await send_sms(db, phone, message, "driver_run_cancelled")
