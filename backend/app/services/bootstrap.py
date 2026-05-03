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
from sqlalchemy import select

from app.database import async_session
from app.models import Admin, Setting
from app.utils.security import hash_password


# (key, default_value, description) — the bare-minimum settings the app reads.
# Adding a row here means: "if this key isn't in the DB, create it on startup."
# Existing values are NEVER overwritten.
DEFAULT_SETTINGS = [
    # ── Company branding ──
    ("company_name", "RideFlow", "Company display name"),
    ("company_phone", "", "Company contact phone"),
    ("company_logo_url", "", "Company logo URL. Empty = default icon."),

    # ── Public URLs ──  (used in SMS messages, Stripe redirects, QR codes)
    ("client_base_url", "http://localhost:5173", "Public URL of the client booking app, e.g. https://ride.example.com"),
    ("staff_base_url", "http://localhost:5174", "Public URL of the staff portal, e.g. https://staff.example.com"),

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
    ("cancellation_window_hours", 2, "Hours before ride for full refund"),
    ("min_advance_booking_hours", 0.5, "Minimum hours before pickup that a client can book. Decimals allowed (0.5 = 30 min)."),
    ("review_expiry_days", 3, "How many days after a ride a client can submit a review"),
    ("unassigned_alert_minutes", 15, "Alert admin if run unassigned after X minutes"),

    # ── Service area & cross-country ──
    ("service_areas", [], "Service areas where bookings can be made. Each entry: {type:'country'|'city', country, name, [bounds, lat, lng, place_id]}. Configurable from admin Settings."),
    ("allow_cross_country_booking", False, "Allow pickup and destination in different countries"),

    # ── Driver priority ──
    ("priority_delay_normal_minutes", 2, "Minutes normal-priority drivers wait before seeing new runs"),
    ("priority_delay_low_minutes", 5, "Minutes low-priority drivers wait before seeing new runs"),

    # ── SMS toggle ──
    ("sms_enabled", True, "Enable SMS notifications"),

    # ── SMS templates ──
    ("sms_cashier_referral", "Hi {cashier_name}, you earned ${amount} from a new booking by {client_name} ({route}). Total earnings: ${total_earnings}.", "SMS to cashier on referral. Vars: {cashier_name}, {amount}, {client_name}, {route}, {total_earnings}, {booking_number}"),
    ("sms_cashier_payout", "Hi {cashier_name}, your commission of ${amount} for booking {booking_number} has been processed.", "SMS to cashier on payout. Vars: {cashier_name}, {amount}, {booking_number}"),
    ("sms_client_booking", "Hi {client_name}, your ride is booked! {pickup_name} → {dropoff_name} on {pickup_date}. View your receipt: {confirmation_url}", "SMS to client after booking. Vars: {client_name}, {pickup_name}, {dropoff_name}, {pickup_date}, {booking_number}, {confirmation_url}"),
    ("sms_client_ride_started", "Hi {client_name}, your ride has started! {driver_name} is taking you from {pickup_name} to {dropoff_name}. Rate your experience: {confirmation_url}", "SMS to client when ride starts. Vars: {client_name}, {driver_name}, {pickup_name}, {dropoff_name}, {confirmation_url}, {booking_number}"),
    ("sms_client_refund", "Hi {client_name}, your booking {booking_number} has been refunded (${amount}). Reason: {reason}. The amount will appear in your account within 5-10 business days.", "SMS to client on refund. Vars: {client_name}, {booking_number}, {amount}, {reason}"),
    ("sms_guest_payment_link", "Hi {client_name}, a ride has been reserved for you by {hotel_name}: {pickup_name} → {dropoff_name} on {pickup_date} at {pickup_time}. Total: ${total_amount}. Pay here: {payment_url}", "SMS to guest when cashier books for them. Vars: {client_name}, {hotel_name}, {pickup_name}, {dropoff_name}, {pickup_date}, {pickup_time}, {total_amount}, {payment_url}, {booking_number}"),
    ("sms_driver_new_run", "Hi {driver_name}, you have a new run! {pickup_name} → {dropoff_name} on {pickup_date} at {pickup_time}. Client: {client_name}. Earnings: ${driver_earnings}.", "SMS to driver on run assignment."),
    ("sms_driver_ride_completed", "Hi {driver_name}, ride completed! {pickup_name} → {dropoff_name}. You earned ${driver_earnings}. Great job!", "SMS to driver on ride completion."),
    ("sms_driver_run_cancelled", "Hi {driver_name}, the run {pickup_name} → {dropoff_name} on {pickup_date} at {pickup_time} has been reassigned. Reason: {reason}", "SMS to driver when run is reassigned."),
    ("sms_driver_payout_released", "Hi {driver_name}, your payout of ${amount} for {route} has been released! The funds are on their way.", "SMS to driver when payout released."),
    ("sms_driver_payout_flagged", "Hi {driver_name}, your payout of ${amount} for {route} has been flagged for review. Please contact support if you have questions.", "SMS to driver when payout flagged."),
    ("sms_driver_payout_rejected", "Hi {driver_name}, your payout of ${amount} for {route} has been rejected. Please contact support for details.", "SMS to driver when payout rejected."),
    ("sms_concierge_batch_link", "Payout of ${amount} sent on {date}. View full breakdown: {url}", "SMS to concierge with public receipt link."),
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


async def ensure_default_settings():
    """Insert any setting key that's missing. Never overwrites existing values."""
    async with async_session() as db:
        existing_r = await db.execute(select(Setting.key))
        existing_keys = {row[0] for row in existing_r.all()}

        added = 0
        for key, value, description in DEFAULT_SETTINGS:
            if key in existing_keys:
                continue
            db.add(Setting(key=key, value=value, description=description))
            added += 1

        if added:
            await db.commit()
            print(f"[bootstrap] Inserted {added} missing default setting(s)")
