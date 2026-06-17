"""
Run-once bootstrap. Invoked by FastAPI's lifespan on app startup.
Ensures the system is launchable on a fresh DB:
  - a default admin exists so the operator can log in
  - every config setting the app reads has a row (idempotent — never overwrites
    a value that's already there)

We do NOT seed operator data here (vehicle rates, extras, common routes, hotels,
etc.) — those are domain-specific and belong to the operator to configure.
"""
import os
from sqlalchemy import select, update

from app.database import async_session
from app.models import Admin, Setting
from app.utils.security import hash_password


# (key, default_value, description) — the bare-minimum settings the app reads.
# Adding a row here means: "if this key isn't in the DB, create it on startup."
# Existing values are NEVER overwritten.
DEFAULT_SETTINGS = [
    # ── Company branding ──
    ("company_name", "RideFlow", "Company display name"),
    ("company_phone", "", "Company contact phone (shown to clients on the confirmation page)"),
    ("company_email", "", "Company support email (shown to clients on the confirmation page)"),
    ("company_logo_url", "", "Company logo URL. Empty = default icon."),

    # ── Public URLs ──  (used in SMS messages, Stripe redirects, QR codes)
    ("client_base_url", "http://localhost:5173", "Public URL of the client booking app, e.g. https://ride.example.com"),
    ("staff_base_url", "http://localhost:5174", "Public URL of the staff portal, e.g. https://staff.example.com"),
    ("website_base_url", "", "Public URL of the marketing website, e.g. https://gobellme.com. Used for legal-page links (privacy, terms, SMS terms) shown in consent text."),

    # ── Marketing website content (gobellme.com landing page) ──
    ("website_hero_badge", "Pre-booked private rides", "Small pill above the hero headline."),
    ("website_hero_title", "Reserve your ride.", "Main hero headline (first line)."),
    ("website_hero_title_accent", "Anywhere. Anytime.", "Hero headline accent line — shown in gold."),
    ("website_hero_subtitle", "Pre-book a private vehicle from A to B and we'll take it from there. Transparent pricing, professional drivers, zero surprises.", "Paragraph under the hero headline."),
    ("website_hero_image_url", "", "Optional hero image URL (a car photo or illustration). Empty = use default decorative pattern."),
    ("website_stat_rides", "10,000+", "Big stat shown under the hero — e.g. number of rides."),
    ("website_stat_rating", "4.9★", "Big stat — average rating."),
    ("website_stat_uptime", "24/7", "Big stat — availability."),
    ("website_how_title", "How it works", "Section heading for the 3-step explainer."),
    ("website_how_subtitle", "Three steps. Designed for travelers who don't want to gamble on a curbside ride.", "Section subhead."),
    ("website_why_title", "Why ride with us", ""),
    ("website_why_subtitle", "The little things that make pre-booking better than the alternative.", ""),
    ("website_fleet_title", "Our fleet", ""),
    ("website_fleet_subtitle", "Pick the size that fits your group. Every vehicle is regularly inspected and clean.", ""),
    ("website_testimonials_title", "What our riders say", ""),
    ("website_testimonials_subtitle", "Real reviews from real rides.", ""),
    ("website_service_title", "Where we operate", ""),
    ("website_service_subtitle", "Currently serving these cities.", ""),
    ("website_contact_title", "Let's talk", ""),
    ("website_contact_subtitle", "Booking question? Special trip request? Anything else? Send us a message — we'll get back to you the same day.", ""),

    # ── Payment & commissions ──
    ("default_driver_pay_pct", 70, "Default driver pay percentage of base fare"),
    ("default_cashier_commission_pct", 10, "Default cashier commission percentage of total"),
    ("cashier_commission_enabled", True, "Enable cashier commissions globally"),
    ("payout_currency", "usd", "ISO currency code for Stripe payouts"),
    ("driver_payout_schedule", "weekly", "How often drivers are paid"),
    ("stripe_connect_enabled", True, "Enable Stripe Connect for driver/cashier payouts"),
    ("late_cancel_refund_pct", 50, "Refund % for late cancellations"),
    ("max_active_runs_per_driver", 5, "Max active (assigned + in_progress) runs per driver at once"),

    # ── Booking ──
    ("booking_window_days", 30, "How many days ahead clients can book"),
    ("cancellation_window_hours", 24, "Hours before pickup that a rider can self-cancel from the receipt and get a full refund. Past this window the cancel button hides and admin must process any refund manually."),
    ("cancellation_refund_percent", 100, "Percent of the paid amount returned when a rider self-cancels inside the window. 100 = full refund (default). Lower it to keep a cancellation fee — e.g. 80 refunds 80% and the business retains 20%."),
    ("min_advance_booking_hours", 0.5, "Minimum hours before pickup that a client can book. Decimals allowed (0.5 = 30 min)."),
    ("review_expiry_days", 3, "How many days after a ride a client can submit a review"),
    ("unassigned_alert_minutes", 15, "Alert admin if run unassigned after X minutes"),
    ("common_route_nearby_radius_km", 8, "Popular routes whose start point is within this many km of the client's location get a 'Near you' badge. All routes are shown either way, sorted nearest-first."),

    # ── Service area & cross-country ──
    ("service_areas", [], "Service areas where bookings can be made. Each entry: {type:'country'|'city', country, name, [bounds, lat, lng, place_id]}. Configurable from admin Settings."),
    ("pickup_locations", [], "Cities where riders can be picked up. Same shape as service_areas. The pickup address autocomplete is restricted to these; destination autocomplete uses the union of pickup_locations + service_areas. Empty list = fall back to service_areas."),
    ("default_rate_tiers", [], "Default distance-pricing tiers used for every vehicle that doesn't define its own. List of {to: number|null, rate: number} sorted ascending; the last to=null means 'and beyond'. Per-vehicle rate_tiers (in Pricing → Vehicle Rates) overrides this when set."),
    ("business_timezone", "America/New_York", "IANA timezone the whole operation runs on. Used for pickup-time comparisons, reminder firing, upsale time-of-day windows, and the receipt label. Defaults to USA Eastern Time. Change only if you open a second region."),
    ("allow_cross_country_booking", False, "Allow pickup and destination in different countries"),

    # ── Driver priority ──
    ("priority_delay_normal_minutes", 2, "Minutes normal-priority drivers wait before seeing new runs"),
    ("priority_delay_low_minutes", 5, "Minutes low-priority drivers wait before seeing new runs"),

    # ── Pre-ride reminders ──
    # All three accept decimals (e.g. 1.5). Set to 0 to disable that reminder.
    # The scheduler ticks every 60 seconds and uses a ±90s window so a backend
    # restart at the wrong second won't miss a reminder.
    ("client_reminder_hours", 1, "Hours before pickup to send the client a reminder SMS. Decimals allowed (e.g. 1.5 = 1h 30m). Set to 0 to disable. Min effective value ≈ 0.05 (≈3 min)."),
    ("client_final_reminder_minutes", 15, "Minutes before pickup to send the client a final 'starting soon' reminder. Set to 0 to disable. Typical: 5–30."),
    ("driver_reminder_hours", 2, "Hours before pickup to send the driver a reminder SMS. Decimals allowed (e.g. 0.5 = 30 min). Set to 0 to disable. Only fires if a driver has been assigned."),

    # ── SMS toggle ──
    ("sms_enabled", True, "Enable SMS notifications"),

    # ── Email (Resend) ──
    ("email_enabled", False, "Enable transactional email via Resend. Requires resend_api_key + resend_from_email below."),
    ("resend_api_key", "", "Resend API key (Resend Dashboard -> API Keys). Treated as a secret — stored in DB but not displayed in plaintext after save."),
    ("resend_from_email", "no-reply@gobellme.com", "From address for transactional emails. The domain MUST be verified in Resend before sending will work."),
    ("resend_from_name", "GoBellMe", "Friendly name shown next to the from address (e.g. 'GoBellMe <no-reply@gobellme.com>')."),
    ("sms_override_consent", False, "Override the rider's SMS consent choice on the booking form — when ON, transactional SMS are sent to every booking regardless of whether the rider checked the consent box. Default OFF (respect the rider's choice)."),

    # ── SMS templates ──
    ("sms_cashier_referral", "Hi {cashier_name}, you earned ${amount} from a new booking by {client_name} ({route}). Total earnings: ${total_earnings}.", "SMS to cashier on referral. Vars: {cashier_name}, {amount}, {client_name}, {route}, {total_earnings}, {booking_number}"),
    ("sms_cashier_payout", "Hi {cashier_name}, your commission of ${amount} for booking {booking_number} has been processed.", "SMS to cashier on payout. Vars: {cashier_name}, {amount}, {booking_number}"),
    ("sms_client_booking", "Hi {client_name}, your ride is booked! {pickup_name} -> {dropoff_name} on {pickup_date}. View your receipt: {confirmation_url}", "SMS to client after booking. Vars: {client_name}, {pickup_name}, {dropoff_name}, {pickup_date}, {booking_number}, {confirmation_url}"),
    ("sms_client_ride_started", "Hi {client_name}, your ride has started! {driver_name} is taking you from {pickup_name} to {dropoff_name}. Rate your experience: {confirmation_url}", "SMS to client when ride starts. Vars: {client_name}, {driver_name}, {pickup_name}, {dropoff_name}, {confirmation_url}, {booking_number}"),
    ("sms_client_ride_completed", "Hi {client_name}, thanks for riding with us! We hope you enjoyed the trip with {driver_name}. We'd love your feedback — please rate your experience here: {confirmation_url}", "SMS to client when ride is completed (thank-you + feedback link). Vars: {client_name}, {driver_name}, {pickup_name}, {dropoff_name}, {confirmation_url}, {booking_number}"),
    ("sms_client_refund", "Hi {client_name}, your booking {booking_number} has been refunded (${amount}) — {reason}. The refund has been issued to your card right away.", "SMS to client on refund. Vars: {client_name}, {booking_number}, {amount}, {reason}"),
    ("sms_guest_payment_link", "Hi {client_name}, a ride has been reserved for you by {hotel_name}: {pickup_name} -> {dropoff_name} on {pickup_date} at {pickup_time}. Total: ${total_amount}. Pay here: {payment_url}", "SMS to guest when cashier books for them. Vars: {client_name}, {hotel_name}, {pickup_name}, {dropoff_name}, {pickup_date}, {pickup_time}, {total_amount}, {payment_url}, {booking_number}"),
    ("sms_driver_new_run", "Hi {driver_name}, you have a new run! {pickup_name} -> {dropoff_name} on {pickup_date} at {pickup_time}. Client: {client_name}. Earnings: ${driver_earnings}.", "SMS to driver on run assignment."),
    ("sms_driver_ride_completed", "Hi {driver_name}, ride completed! {pickup_name} -> {dropoff_name}. You earned ${driver_earnings}. Great job!", "SMS to driver on ride completion."),
    ("sms_driver_run_cancelled", "Hi {driver_name}, the run {pickup_name} -> {dropoff_name} on {pickup_date} at {pickup_time} has been reassigned. Reason: {reason}", "SMS to driver when run is reassigned by admin."),
    ("sms_driver_run_cancelled_by_rider", "Hi {driver_name}, the rider cancelled their {pickup_name} -> {dropoff_name} run on {pickup_date} at {pickup_time}. The booking is no longer on your schedule.", "SMS to the assigned driver when the rider cancels from the receipt. Vars: {driver_name}, {pickup_name}, {dropoff_name}, {pickup_date}, {pickup_time}, {booking_number}"),
    ("sms_driver_payout_released", "Hi {driver_name}, your payout of ${amount} for {route} has been released! The funds are on their way.", "SMS to driver when payout released."),
    ("sms_driver_payout_flagged", "Hi {driver_name}, your payout of ${amount} for {route} has been flagged for review. Please contact support if you have questions.", "SMS to driver when payout flagged."),
    ("sms_driver_payout_rejected", "Hi {driver_name}, your payout of ${amount} for {route} has been rejected. Please contact support for details.", "SMS to driver when payout rejected."),
    ("sms_concierge_batch_link", "Payout of ${amount} sent on {date}. View full breakdown: {url}", "SMS to concierge with public receipt link."),

    # ── Pre-ride reminder templates ──
    ("sms_client_reminder", "Hi {client_name}, friendly reminder — your ride is in about {hours} hour(s) at {pickup_time}. Pickup: {pickup_name}. View details: {confirmation_url}",
     "Sent to client X hours before pickup (X = client_reminder_hours). Vars: {client_name}, {driver_name}, {pickup_name}, {dropoff_name}, {pickup_time}, {hours}, {confirmation_url}, {booking_number}. Note: {driver_name} is empty if no driver assigned yet."),
    ("sms_client_final_reminder", "Hi {client_name}, your ride is starting in {minutes} minutes at {pickup_name}. Make sure you're ready! {confirmation_url}",
     "Final 'starting soon' reminder to client X minutes before pickup (X = client_final_reminder_minutes). Vars: {client_name}, {driver_name}, {pickup_name}, {dropoff_name}, {minutes}, {confirmation_url}, {booking_number}."),
    ("sms_driver_reminder", "Hi {driver_name}, you have a run in {hours} hour(s) at {pickup_time}. {pickup_name} -> {dropoff_name}. Client: {client_name} ({client_phone}).",
     "Sent to driver X hours before pickup (X = driver_reminder_hours). Vars: {driver_name}, {client_name}, {client_phone}, {pickup_name}, {dropoff_name}, {pickup_time}, {hours}, {vehicle_type}, {booking_number}. Only sent if a driver is assigned."),

    # ── Driver action button templates ──
    ("sms_driver_on_way", "Hi {client_name}, your driver {driver_name} is on the way to pick you up at {pickup_name}. They'll be there shortly!",
     "Sent to client when driver taps 'On my way'. Vars: {client_name}, {driver_name}, {driver_phone}, {pickup_name}, {dropoff_name}, {vehicle_type}, {booking_number}. Add {driver_phone} to the text if you want clients to be able to call the driver directly."),
    ("sms_driver_arrived", "Hi {client_name}, your driver {driver_name} has arrived at {pickup_name} and is waiting for you.",
     "Sent to client when driver taps 'I've arrived'. Vars: {client_name}, {driver_name}, {driver_phone}, {pickup_name}, {dropoff_name}, {vehicle_type}, {booking_number}. Add {driver_phone} to the text if you want clients to be able to call the driver directly."),
]


async def ensure_default_admin():
    """Ensure at least one super-admin exists. Idempotent — only creates if there
    is no super_admin in the table."""
    email = os.environ.get("DEFAULT_ADMIN_EMAIL", "onthewayhomeward@gmail.com")
    password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "mahtot@rideflow#21")
    name = os.environ.get("DEFAULT_ADMIN_NAME", "Super Admin")

    async with async_session() as db:
        existing = await db.execute(select(Admin).where(Admin.role == "super_admin").limit(1))
        if existing.scalar_one_or_none():
            return  # at least one super admin exists — nothing to do

        admin = Admin(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role="super_admin",
            password_changed=True,  # super admin sets their own bootstrap pw, no nag
        )
        db.add(admin)
        await db.commit()
        print(f"[bootstrap] Created super admin: {email}")


# Templates whose previously-shipped default text has known bugs (literal
# {placeholder} that was never wired, factually wrong wording, etc.). On boot
# we replace the row ONLY if its current value still exactly matches the stale
# string — meaning the admin never customized it via the UI. Any custom text
# is left alone. Add (key, old_default) pairs here when you ship a fix that
# needs to land on already-deployed installs without a manual UI edit.
STALE_DEFAULT_UPGRADES = {
    "sms_client_refund": (
        # Old default — had literal "{reason}" because the cancel endpoint
        # never passed it, and the 5-10-days line was misleading for Stripe.
        "Hi {client_name}, your booking {booking_number} has been refunded (${amount}). Reason: {reason}. The amount will appear in your account within 5-10 business days.",
    ),
}


async def ensure_default_settings():
    """Insert any setting key that's missing. Never overwrites custom values —
    but does replace rows whose value still exactly matches a known-stale
    default (see STALE_DEFAULT_UPGRADES) so bugfixes ship without a manual edit."""
    async with async_session() as db:
        existing_r = await db.execute(select(Setting.key, Setting.value))
        existing = {row[0]: row[1] for row in existing_r.all()}
        defaults_by_key = {k: (v, d) for k, v, d in DEFAULT_SETTINGS}

        added = 0
        for key, value, description in DEFAULT_SETTINGS:
            if key in existing:
                continue
            db.add(Setting(key=key, value=value, description=description))
            added += 1

        upgraded = 0
        for key, stale_values in STALE_DEFAULT_UPGRADES.items():
            if key not in existing or key not in defaults_by_key:
                continue
            current = existing[key]
            current_str = current if isinstance(current, str) else str(current)
            if current_str in stale_values:
                new_value, new_desc = defaults_by_key[key]
                await db.execute(
                    update(Setting)
                    .where(Setting.key == key)
                    .values(value=new_value, description=new_desc)
                )
                upgraded += 1

        if added or upgraded:
            await db.commit()
            if added:
                print(f"[bootstrap] Inserted {added} missing default setting(s)")
            if upgraded:
                print(f"[bootstrap] Upgraded {upgraded} stale default template(s)")
