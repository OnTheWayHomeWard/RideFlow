# 13 — Deployment & Environment Guide

## Quick Start

### Prerequisites
- Docker Desktop installed and running
- Node.js 20+ (for dev mode only)
- Git

### 1. Clone and configure

```bash
cd TRANSPORT_1
cp .env.example .env
```

Edit `.env` with your values (see Environment Variables section below).

### 2. Start the system

**Development mode** (recommended for development):
```bash
./start.sh dev
```
- Database + Backend run in Docker
- 4 Frontend apps run locally with hot reload
- Best for making changes — edits reflect instantly

**Full Docker mode** (for staging/production):
```bash
./start.sh docker
```
- Everything runs in Docker containers
- One command, no local dependencies needed
- Slower to rebuild on changes

### 3. First-time setup

On first run, the system automatically:
1. Creates the PostgreSQL database
2. Runs all migrations (creates tables)
3. Seeds default data (admin account, vehicle rates, settings, etc.)

**Default admin login:** `admin@rideflow.com` / `changeme`

### 4. Stop everything

```bash
./stop.sh
```

---

## Services & Ports

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Client Booking | 5173 | http://localhost:5173 | Public booking site — clients book rides here |
| Driver Portal | 5174 | http://localhost:5174 | Drivers accept/manage rides |
| Admin Dashboard | 5175 | http://localhost:5175 | Admin manages everything |
| Cashier Portal | 5176 | http://localhost:5176 | Cashiers view QR, referrals, earnings |
| Backend API | 8000 | http://localhost:8000 | FastAPI backend |
| API Docs (Swagger) | 8000 | http://localhost:8000/docs | Interactive API documentation |
| PostgreSQL | 5432 | localhost:5432 | Database |

---

## Environment Variables (.env)

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PASSWORD` | Yes | — | PostgreSQL password. Used by both the database and backend to connect. Pick any strong password. |

**Example:** `DB_PASSWORD=my_secure_password_2026`

### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Secret key used to sign JWT tokens for admin, driver, and cashier authentication. Must be a long random string. Change this in production — if someone knows this, they can forge login tokens. |

**Example:** `JWT_SECRET=a1b2c3d4e5f6-change-this-to-something-random-and-long`

### Stripe (Payments)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | No* | — | Your Stripe secret API key. Starts with `sk_test_` (test mode) or `sk_live_` (production). |
| `STRIPE_WEBHOOK_SECRET` | No* | — | Stripe webhook signing secret. Starts with `whsec_`. Used to verify webhook calls from Stripe are authentic. |

**Dev mode:** Set to `sk_test_placeholder` — payments are simulated locally without hitting Stripe. A dev-confirm URL is generated that auto-completes the payment.

**Production:** Get your keys from https://dashboard.stripe.com/apikeys

**Example (dev):**
```
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
```

**Example (production):**
```
STRIPE_SECRET_KEY=sk_live_abc123...
STRIPE_WEBHOOK_SECRET=whsec_xyz789...
```

### Twilio (SMS Notifications)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | No* | — | Your Twilio Account SID. Found at https://console.twilio.com |
| `TWILIO_AUTH_TOKEN` | No* | — | Your Twilio Auth Token. |
| `TWILIO_PHONE_NUMBER` | No* | — | The Twilio phone number to send SMS from. Format: `+15551234567` |

**Dev mode:** Set to `placeholder` — SMS messages are printed to the backend console instead of being sent. All messages are still logged in the `notification_log` database table.

**Production:** Sign up at https://www.twilio.com and get your credentials.

**Example (dev):**
```
TWILIO_ACCOUNT_SID=placeholder
TWILIO_AUTH_TOKEN=placeholder
TWILIO_PHONE_NUMBER=+15550000000
```

**Example (production):**
```
TWILIO_ACCOUNT_SID=AC1234567890abcdef
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

### Google Maps (Distance Calculation & Autocomplete)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_MAPS_API_KEY` | No* | — | Google Maps Platform API key. Used for address autocomplete, distance calculation, and geofencing. |

**Dev mode:** Set to `placeholder` — distance calculation uses a rough coordinate-based estimate instead of the Google Maps Distance Matrix API. Address autocomplete won't work (clients type addresses manually).

**Production:** Get a key from https://console.cloud.google.com with these APIs enabled:
- Places API (autocomplete)
- Distance Matrix API
- Geocoding API
- Maps JavaScript API

**Example (dev):**
```
GOOGLE_MAPS_API_KEY=placeholder
```

**Example (production):**
```
GOOGLE_MAPS_API_KEY=AIzaSy...your_key_here
```

---

## Full .env File Template

```bash
# === Database ===
DB_PASSWORD=rideflow_secure_2026

# === Authentication ===
JWT_SECRET=change-this-to-a-long-random-string-in-production

# === Stripe (Payments) ===
# Dev mode: use placeholders — payments simulated locally
# Production: get keys from https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder

# === Twilio (SMS) ===
# Dev mode: use placeholders — SMS printed to console
# Production: get credentials from https://console.twilio.com
TWILIO_ACCOUNT_SID=placeholder
TWILIO_AUTH_TOKEN=placeholder
TWILIO_PHONE_NUMBER=+15550000000

# === Google Maps ===
# Dev mode: use placeholder — rough distance estimate used
# Production: get key from https://console.cloud.google.com
GOOGLE_MAPS_API_KEY=placeholder
```

---

## Database Management

### Access the database directly
```bash
docker compose exec db psql -U rideflow
```

### Run migrations
```bash
docker compose exec backend alembic upgrade head
```

### Create a new migration (after model changes)
```bash
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic upgrade head
```

### Seed default data
```bash
docker compose exec backend python -m app.seed
```

### Seed sample/test data (dev only)
```bash
docker compose exec backend python -m app.seed_dev
```

### Backup database
```bash
docker compose exec db pg_dump -U rideflow rideflow > backup.sql
```

### Restore database
```bash
docker compose exec -T db psql -U rideflow rideflow < backup.sql
```

---

## Application Settings (Admin Dashboard)

These settings are configured from the Admin Dashboard (Settings page) and stored in the database. They do NOT require restarting the system — changes take effect immediately.

### Company

| Setting | Default | Description |
|---------|---------|-------------|
| `company_name` | RideFlow | Company display name — shown on all portals, QR codes, SMS |
| `company_phone` | (empty) | Company phone number — shown in client confirmation, help sections |
| `company_logo_url` | (empty) | URL to company logo image — shown in all portal headers, QR codes |

### Payment & Commissions

| Setting | Default | Description |
|---------|---------|-------------|
| `default_driver_pay_pct` | 70 | Default percentage drivers receive from the base fare. Can be overridden per driver. |
| `default_cashier_commission_pct` | 10 | Default cashier commission percentage. Can be overridden per hotel or per cashier. |
| `cashier_commission_enabled` | true | Global toggle to enable/disable cashier commissions |
| `driver_payout_schedule` | weekly | How often drivers are paid (display only — actual payouts are manual via admin) |
| `late_cancel_refund_pct` | 50 | Refund percentage for late cancellations |
| `max_active_runs_per_driver` | 5 | Maximum active (assigned + in progress) runs a driver can have at once |

### Booking

| Setting | Default | Description |
|---------|---------|-------------|
| `booking_window_days` | 30 | How many days ahead clients can book a ride |
| `cancellation_window_hours` | 2 | Hours before pickup for full refund cancellation |
| `unassigned_alert_minutes` | 15 | Alert admin if a paid run has no driver after this many minutes |
| `review_expiry_days` | 3 | Days after ride that clients can submit a review |

### Notifications

| Setting | Default | Description |
|---------|---------|-------------|
| `sms_enabled` | true | Global toggle for all SMS notifications |
| `sms_cashier_referral` | (template) | SMS sent to cashier when their referral books. Variables: `{cashier_name}`, `{amount}`, `{client_name}`, `{route}`, `{total_earnings}`, `{booking_number}` |
| `sms_cashier_payout` | (template) | SMS sent to cashier when commission is processed. Variables: `{cashier_name}`, `{amount}`, `{booking_number}` |
| `sms_client_booking` | (template) | SMS sent to client after booking with receipt link. Variables: `{client_name}`, `{pickup_name}`, `{dropoff_name}`, `{pickup_date}`, `{booking_number}`, `{confirmation_url}` |
| `sms_client_ride_started` | (template) | SMS sent to client when ride starts with rating link. Variables: `{client_name}`, `{driver_name}`, `{pickup_name}`, `{dropoff_name}`, `{booking_number}`, `{confirmation_url}` |

---

## Default Accounts (after seeding)

| Role | Login | Password | Portal |
|------|-------|----------|--------|
| Admin | admin@rideflow.com | changeme | http://localhost:5175 |

Drivers and cashiers are created by admin. Default password = last 4 digits of phone number. They are prompted to change on first login.

---

## Troubleshooting

### Backend won't start
```bash
docker compose logs backend
```
Common issues:
- Database not ready yet — wait and retry
- Missing migration — run `docker compose exec backend alembic upgrade head`
- Port 8000 already in use — stop other services on that port

### Frontend shows blank page
- Check browser console for errors
- Ensure backend is running: `curl http://localhost:8000/api/health`
- Check proxy config in `vite.config.js`

### Database connection refused
- Ensure db container is running: `docker compose ps`
- Check if port 5432 is available: `docker compose logs db`

### Payments not working
- In dev mode: payments are simulated — the "Pay" button auto-confirms
- In production: ensure `STRIPE_SECRET_KEY` is a real key (not placeholder)
- For webhooks: run `stripe listen --forward-to localhost:8000/api/payments/webhook`

### SMS not sending
- In dev mode: SMS is printed to console (`docker compose logs backend`)
- In production: ensure Twilio credentials are real (not placeholder)
- Check `notification_log` table for message status
