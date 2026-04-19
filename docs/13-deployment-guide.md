# Deployment Guide

Complete guide to deploy RideFlow in production. Start from a fresh Ubuntu VPS / cloud VM and end with a live system.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables Reference](#2-environment-variables-reference)
3. [Production Deployment Step-by-Step](#3-production-deployment-step-by-step)
4. [Post-Deploy Configuration](#4-post-deploy-configuration-admin-dashboard)
5. [Backend Integrations Setup](#5-backend-integrations-setup)
6. [Ongoing Operations](#6-ongoing-operations)
7. [Development Mode](#7-development-mode)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Architecture Overview

```
                       Internet
                          │
                    ┌─────┴─────┐
                    │   Nginx   │ (TLS/SSL + reverse proxy)
                    └─────┬─────┘
    ┌───────────┬─────────┼──────────┬───────────┐
    │           │         │          │           │
 book.domain  driver   admin     cashier     /api
   :5173      :5174    :5175     :5176      :8000
    │           │         │          │           │
    └───────────┴─────────┴──────────┴───────────┘
                      (shared)
                          │
                    ┌─────┴─────┐
                    │ PostgreSQL │
                    └───────────┘
```

**6 services** run as Docker containers:
- `db` — PostgreSQL 16 (data)
- `backend` — FastAPI (Python) port 8000
- `client` — React Vite port 5173 (public booking site)
- `driver` — React Vite port 5174 (driver portal)
- `admin` — React Vite port 5175 (admin dashboard)
- `cashier` — React Vite port 5176 (cashier portal)

**External integrations:**
- **Stripe** — payments from clients + Connect transfers to drivers/concierges
- **Twilio** — SMS notifications
- **Google Maps** — address autocomplete + distance calculation

---

## 2. Environment Variables Reference

All env vars live in a single `.env` file at the repo root. The docker-compose reads them automatically.

### `DB_PASSWORD` — **Required**
Password for the PostgreSQL `rideflow` user. Used by both the `db` container (creation) and the `backend` container (connection).
- **Must be strong in production** — treat like a secret
- Generate: `openssl rand -base64 24`

### `JWT_SECRET` — **Required**
Secret key used to sign JWT tokens for admin/driver/cashier login and for public onboarding/batch-view links.
- If leaked, attackers can forge login tokens — **critical**
- Generate: `openssl rand -hex 32` (gives 64-character hex)

### `STRIPE_SECRET_KEY` — Payments
Stripe API key. Starts with `sk_test_` (test mode) or `sk_live_` (production).
- **Value `sk_test_placeholder` or empty** → dev mode: payments simulated, no real Stripe calls, Stripe Connect onboarding returns fake IDs, transfers print to console
- **Real `sk_test_...`** → live Stripe test mode (real API, no real money — use test cards)
- **`sk_live_...`** → real charges on real cards
- Get from: Stripe Dashboard → Developers → API Keys

### `STRIPE_WEBHOOK_SECRET` — Payments
Signing secret for the `/api/payments/webhook` endpoint. Stripe signs every webhook call with this — backend rejects unsigned/invalid calls.
- Create webhook at Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL to register: `https://yourdomain.com/api/payments/webhook`
- Event to subscribe: `checkout.session.completed`
- Copy the **Signing secret** (starts with `whsec_`) into this env var
- Value `whsec_placeholder` = skip signature verification (dev mode only)

### `TWILIO_ACCOUNT_SID` — SMS
Your Twilio account SID. Starts with `AC`.
- **Value `placeholder` or empty** → dev mode: SMS logged to backend console, not sent
- Find it at: Twilio Console dashboard (top right)

### `TWILIO_AUTH_TOKEN` — SMS
Twilio API secret. Paired with SID to authenticate.
- Find it at: Twilio Console dashboard
- Keep secret — anyone with this can send SMS billed to your account

### `TWILIO_PHONE_NUMBER` — SMS
The "From" number Twilio sends SMS from. Must be a Twilio-owned number you purchased.
- Format: E.164, e.g. `+15551234567`
- Buy at: Twilio Console → Phone Numbers → Manage → Buy a Number (~$1/month)
- For test/trial accounts: recipient phones must be verified first

### `GOOGLE_MAPS_API_KEY` — Address autocomplete
Google Maps JavaScript API key with Places + Geocoding enabled.
- **Value `placeholder` or empty** → address inputs fall back to plain text (no autocomplete); distance calculated with rough coordinate math
- Get from: Google Cloud Console → APIs & Services → Credentials
- Required APIs to enable on the key:
  - Places API (autocomplete + country restriction)
  - Geocoding API (reverse geocode for service-area detection)
  - Distance Matrix API (accurate distances)
  - Maps JavaScript API
- **Restrict the key** to your frontend domains (HTTP referrers) before going live

### Sample `.env` for Production

```bash
# Database
DB_PASSWORD=7zQ3_K9vNpX4wBmT_Rq8fA2jS
# JWT
JWT_SECRET=1f4e8c2d9a7b3f6e5c8a1d4b7e2c9f6a3d8b5e2c9f6a3d8b5e2c9f6a3d8b5e2
# Stripe
STRIPE_SECRET_KEY=sk_live_51abc...YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_xyz789...
# Twilio
TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
# Google Maps
GOOGLE_MAPS_API_KEY=AIzaSyB...
```

---

## 3. Production Deployment Step-by-Step

Target server: Ubuntu 22.04 LTS, 2 vCPU, 4 GB RAM minimum (8 GB recommended), 40 GB disk. A domain name pointed at your server's IP is required.

### Step 3.1 — Provision the server

```bash
# SSH in as root
ssh root@your-server-ip

# Create a non-root user for running the app
adduser rideflow
usermod -aG sudo rideflow
su - rideflow
```

### Step 3.2 — Install Docker + Docker Compose

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out + log back in for group to take effect
exit
# (SSH back in)

# Verify
docker --version
docker compose version
```

### Step 3.3 — Clone the repository

```bash
# Install git if not present
sudo apt install -y git

# Clone
cd ~
git clone https://github.com/YOUR_ORG/TRANSPORT_1.git rideflow
cd rideflow
```

### Step 3.4 — Create and fill `.env`

```bash
cp .env.example .env
nano .env
```

Paste your production values (see **Section 2** for what each var means). Save and close.

**Generate secrets if needed:**
```bash
echo "DB_PASSWORD=$(openssl rand -base64 24)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
```

### Step 3.5 — Build and start all containers

```bash
# Build images
docker compose build

# Start all services in detached mode
docker compose up -d

# Wait for DB to become healthy (takes ~10 seconds)
docker compose ps
# Repeat until db shows "healthy"
```

### Step 3.6 — Initialize database

```bash
# Run migrations (creates all tables)
docker compose exec backend alembic upgrade head

# Seed reference data (vehicle types, extras, settings, SMS templates)
docker compose exec backend python -m app.seed
```

### Step 3.7 — Create your first super admin

The seed script creates a default admin (`admin@rideflow.com` / `changeme`) for dev convenience. **For production**, skip those defaults and create your own:

```bash
docker compose exec backend python -m app.create_admin \
  owner@yourcompany.com \
  "YourStrongPassword123!" \
  "Your Name"
```

This creates a super admin with:
- Your email
- Your password (already hashed securely)
- Role: `super_admin`
- `password_changed=true` (won't prompt to change on first login)

You can run this **multiple times** with different emails to create additional super admins. It will refuse to create if the email already exists.

**Delete the default admin** after confirming your new admin works:
```bash
docker compose exec db psql -U rideflow -c "DELETE FROM admins WHERE email = 'admin@rideflow.com';"
```

### Step 3.8 — Verify all services are running

```bash
docker compose ps
# All should show "Up" or "healthy"

# Health check
curl http://localhost:8000/api/health
# Should return: {"status":"ok","service":"rideflow-api","version":"0.1.0","payment_mode":"live_stripe"}
```

### Step 3.9 — Install and configure Nginx + TLS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/rideflow`:

```nginx
# Public client booking (main domain)
server {
    listen 80;
    server_name yourdomain.com;

    # API shared across all sub-sites
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        # Increase for Stripe webhook + long operations
        client_max_body_size 10M;
    }

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
    }
}

# Driver portal
server {
    listen 80;
    server_name driver.yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }
    location / { proxy_pass http://localhost:5174; }
}

# Admin dashboard
server {
    listen 80;
    server_name admin.yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }
    location / { proxy_pass http://localhost:5175; }
}

# Cashier portal
server {
    listen 80;
    server_name cashier.yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }
    location / { proxy_pass http://localhost:5176; }
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/rideflow /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # remove the default site
sudo nginx -t
sudo systemctl reload nginx
```

### Step 3.10 — Get free TLS certificates for all 4 subdomains

Make sure DNS A records exist for: `yourdomain.com`, `driver.yourdomain.com`, `admin.yourdomain.com`, `cashier.yourdomain.com` — all pointing to your server's IP.

```bash
sudo certbot --nginx \
  -d yourdomain.com \
  -d driver.yourdomain.com \
  -d admin.yourdomain.com \
  -d cashier.yourdomain.com \
  --agree-tos -m you@yourdomain.com --redirect --non-interactive
```

Certbot will automatically rewrite the nginx config to use HTTPS and set up auto-renewal.

### Step 3.11 — Update onboarding/callback URLs to production

The backend currently hardcodes `http://localhost:5175` for concierge onboarding return URLs. Before going live, update these to your production admin domain. Search for and replace `http://localhost:5175` in:
- `backend/app/routers/admin.py` (concierge onboarding URLs)
- Similar for driver/cashier `http://localhost:5174` and `http://localhost:5176` in their portal endpoints
- Client confirmation URLs in payment_service + drivers.py use `http://localhost:5173`

Then rebuild + restart:
```bash
docker compose build backend
docker compose up -d backend
```

### Step 3.12 — Configure Stripe webhook

1. Log in to Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://yourdomain.com/api/payments/webhook`
3. **Events to send:** `checkout.session.completed`
4. Click "Add endpoint", then click the created webhook to reveal the **Signing secret** (`whsec_...`)
5. Update `.env`:
   ```bash
   nano .env
   # set STRIPE_WEBHOOK_SECRET=whsec_...
   docker compose restart backend
   ```

### Step 3.13 — Enable Stripe Connect

1. Stripe Dashboard → **Connect → Get started**
2. Choose **"Platform or Marketplace"**
3. Choose **"Express"** account type
4. Complete your platform profile (business info)
5. No env var change needed — uses the same `STRIPE_SECRET_KEY`

---

## 4. Post-Deploy Configuration (Admin Dashboard)

Open `https://admin.yourdomain.com`, log in as `admin@rideflow.com / changeme`, and:

### 4.1 — Change admin password
Click your avatar → Change Password. Choose something strong.

### 4.2 — Configure Settings page

| Group | What to set |
|-------|-------------|
| **Company** | Company name, phone, logo URL — appear on all portals, SMS, and QR codes |
| **Service Area** | Pick countries where you operate. Clients outside see a warning |
| **Allow Cross-Country Booking** | Toggle off if pickup + destination must be same country |
| **Payment & Commissions** | Default driver pay % (70), cashier commission % (10), max active runs per driver (5) |
| **Booking** | Booking window (30 days), cancellation window (2 hrs), review expiry (3 days) |
| **Driver Priority** | Time delays — Normal: 2 min, Low: 5 min |
| **Stripe Connect** | Enable/disable, set payout currency (usd/eur/gbp) |
| **SMS Templates** | Customize all template text (variables in braces: `{client_name}`, etc.) |

### 4.3 — Pricing page
- **Vehicle Rates**: base fare, per mile rate, passengers, luggage, image URL, description
- **Add-ons**: extras like child seat, room pickup, etc. with flat or % price
- **Common Routes**: fixed-price routes (e.g. Airport→Downtown = $45)

### 4.4 — Create operational entities
- **Concierges**: name, phone, email → Generate onboarding link → send to concierge via SMS/email
- **Hotels**: link to a concierge (for payout flow)
- **Cashiers**: link to a hotel → their ref code auto-generated
- **Drivers**: admin-added → default password is last 4 digits of phone

---

## 5. Backend Integrations Setup

### 5.1 — Stripe test card reference

During live Stripe testing:
| Card | What it does |
|------|--------------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0077` | Payment that adds to your test platform balance |
| `4000 0000 0000 9995` | Declined (insufficient funds) |

Any future expiry, any CVC, any ZIP.

### 5.2 — Stripe Connect test account setup

When a driver/concierge goes through Stripe onboarding in test mode, use:
- Phone: `000 000 0000` (SMS code: `000000`)
- SSN last 4: `0000`
- Routing: `110000000`
- Account: `000123456789`

Or click **"Use test data"** link at the top of Stripe's hosted onboarding page.

### 5.3 — Twilio production setup

After buying a phone number:
1. Verify ownership of your "from" number works with SMS capability
2. If trial account: verify every recipient phone number before you can SMS them
3. Upgrade to paid by adding payment method when ready

### 5.4 — Google Maps key restriction

After creating the API key:
1. Google Cloud Console → Credentials → Edit key
2. **Application restrictions** → HTTP referrers → add:
   - `https://yourdomain.com/*`
   - `https://*.yourdomain.com/*`
3. **API restrictions** → Restrict to: Places API, Geocoding API, Distance Matrix API, Maps JavaScript API

---

## 6. Ongoing Operations

### 6.1 — Deploying code updates

```bash
cd ~/rideflow
git pull

# If only backend code changed:
docker compose up -d --build backend

# If frontend code changed:
docker compose up -d --build client driver admin cashier

# If migrations are needed:
docker compose exec backend alembic upgrade head

# Check logs
docker compose logs -f backend
```

### 6.2 — Database backups

**Manual backup:**
```bash
docker compose exec db pg_dump -U rideflow rideflow > ~/backups/rideflow-$(date +%Y%m%d-%H%M).sql
```

**Automated nightly backup (cron):**
```bash
mkdir -p ~/backups
(crontab -l 2>/dev/null; echo "0 3 * * * cd ~/rideflow && docker compose exec -T db pg_dump -U rideflow rideflow | gzip > ~/backups/rideflow-\$(date +\%Y\%m\%d).sql.gz") | crontab -
```

**Restore from backup:**
```bash
gunzip -c ~/backups/rideflow-20260419.sql.gz | docker compose exec -T db psql -U rideflow rideflow
```

### 6.3 — Logs

```bash
# Live backend logs
docker compose logs -f backend

# All services, last 100 lines
docker compose logs --tail 100

# Specific error search
docker compose logs backend | grep ERROR
```

### 6.4 — Database access

```bash
# psql shell
docker compose exec db psql -U rideflow

# Quick one-off query
docker compose exec db psql -U rideflow -c "SELECT COUNT(*) FROM bookings;"
```

### 6.5 — Stop / start services

```bash
# Stop everything
docker compose down

# Stop + remove volumes (DELETES DATABASE!)
docker compose down -v

# Start
docker compose up -d

# Restart a single service
docker compose restart backend
```

---

## 7. Development Mode

For developing locally on your laptop (not production):

```bash
# Clone + configure
git clone https://github.com/YOUR_ORG/TRANSPORT_1.git
cd TRANSPORT_1
cp .env.example .env
# keep placeholders — they trigger dev mode

# Start DB + backend in Docker
docker compose up -d db backend

# Migrate + seed
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed

# Run frontends locally with hot reload (install Node 20+ first)
cd frontend/client && npm install && npx vite --host 0.0.0.0 --port 5173 &
cd frontend/driver && npm install && npx vite --host 0.0.0.0 --port 5174 &
cd frontend/admin && npm install && npx vite --host 0.0.0.0 --port 5175 &
cd frontend/cashier && npm install && npx vite --host 0.0.0.0 --port 5176 &
```

Or use the helper script:
```bash
./start.sh dev
```

**Dev URLs:**
- Client: http://localhost:5173
- Driver: http://localhost:5174
- Admin: http://localhost:5175
- Cashier: http://localhost:5176
- API: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs

**What's different in dev mode:**
- Stripe: simulated payments — visit `/api/payments/dev-confirm/{booking_number}` to "pay"
- Twilio: SMS printed to backend console, not sent
- Google Maps: address inputs are plain text, distance is approximated
- All Stripe Connect accounts return fake `acct_dev_*` IDs instantly "connected"

**Test SMS endpoint** (dev only — returns error in production unless Twilio keys set):
```bash
POST http://localhost:8000/api/test-sms?phone=+15551234567&message=Hello
```

---

## 8. Troubleshooting

### Backend won't start

```bash
docker compose logs backend | tail -30
```

Common causes:
- **Database not ready**: wait 10s after `docker compose up`, then restart backend
- **Missing migration**: `docker compose exec backend alembic upgrade head`
- **Port 8000 in use on host**: `sudo lsof -i :8000` → kill or change port in compose

### Payments not triggering splits

- Check Stripe Dashboard → Webhooks → your endpoint → recent deliveries
- 200 OK = webhook fired, backend processed it
- 500 = check backend logs for the error
- No deliveries = webhook not firing, verify URL is `https://yourdomain.com/api/payments/webhook` and event = `checkout.session.completed`

### SMS not sending

- **Dev mode** (placeholder credentials): look for `[SMS DEV]` in backend logs
- **Trial account**: recipient must be verified at Twilio Console → Phone Numbers → Verified
- **Production**: check `docker compose exec db psql -U rideflow -c "SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 5;"`
  - status=`failed` with error message = read the error
  - status=`delivered` but user didn't receive = Twilio or carrier issue, check Twilio Console logs

### Stripe transfer fails with "insufficient funds"

Your Stripe test balance is $0 by default. Use test card `4000 0000 0000 0077` for a client payment — it adds to your platform balance. Then retry the transfer.

### Stripe transfer fails with "charges_enabled: false"

The connected account (driver/concierge) hasn't completed onboarding fully. Send them their onboarding link again, or in test mode click "Use test data" on the Stripe hosted page.

### Refund not processing

- Verify the booking's Payment record has a valid `stripe_payment_id` (not null, not dev ID)
- Check Stripe Dashboard → Payments → find the payment → issue refund there manually as a fallback

### Address autocomplete not working

- `GOOGLE_MAPS_API_KEY` must NOT be `placeholder` or empty
- Google Cloud Console → Credentials → verify the key has Places API enabled
- Check browser DevTools console for Google Maps errors (usually key or referrer-restriction issues)

### TLS renewal issues

```bash
sudo certbot renew --dry-run     # test renewal
sudo systemctl reload nginx      # if certs renewed but nginx still serving old
```

### Database connection refused

```bash
docker compose ps                 # is db "healthy"?
docker compose logs db | tail -20
```

If database volume is corrupted:
```bash
docker compose down
docker volume rm transport_1_postgres_data   # WARNING: deletes all data!
docker compose up -d
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
# restore from backup if needed
```

---

## Appendix — Quick Reference

### Managing Super Admins

There is **no admin-CRUD UI** — admin accounts are managed via the seed script or direct DB access.

#### Default admin (created by seed)
- Email: `admin@rideflow.com`
- Password: `changeme`
- Role: `super_admin`
- **Change the password immediately** after first login (Admin → Change Password)

#### Customize the default admin before first seed
Edit `backend/app/seed.py` around line 25:
```python
admin = Admin(
    name="Your Name",
    email="your@email.com",
    password_hash=hash_password("your-strong-password"),
    role="super_admin",
)
```
Then run seed as normal. **This only works if no admin exists yet** — the seed skips if any admin is already in the DB.

#### Create additional admins (after initial seed)

The seed only creates ONE admin. To add more, insert directly into the DB:

```bash
# 1. Generate a bcrypt hash of the new password
docker compose exec backend python -c "from app.utils.security import hash_password; print(hash_password('new-password-here'))"
# Copy the output (starts with $2b$...)

# 2. Insert the new admin (replace values with your own)
docker compose exec db psql -U rideflow -c "INSERT INTO admins (id, name, email, password_hash, role, password_changed, created_at) VALUES (gen_random_uuid(), 'Jane Doe', 'jane@yourdomain.com', '\$2b\$12\$YOUR_HASH_HERE', 'super_admin', false, NOW());"
```

Valid roles: `super_admin` (full access), `admin` (standard access).

#### Reset lost admin password

```bash
# 1. Generate new hash
docker compose exec backend python -c "from app.utils.security import hash_password; print(hash_password('new-password-here'))"

# 2. Update the admin record
docker compose exec db psql -U rideflow -c "UPDATE admins SET password_hash = '\$2b\$12\$NEW_HASH_HERE' WHERE email = 'admin@rideflow.com';"
```

#### List all admins

```bash
docker compose exec db psql -U rideflow -c "SELECT id, name, email, role, password_changed, created_at FROM admins;"
```

#### Delete an admin

```bash
docker compose exec db psql -U rideflow -c "DELETE FROM admins WHERE email = 'someone@yourdomain.com';"
```

**Warning:** Never delete the last super_admin — you'll lose all access. Always create a replacement first.

### Default admin account
- Email: `admin@rideflow.com`
- Password: `changeme`
- **Change immediately after first login**

### All SMS templates (customizable in Admin → Settings → SMS Templates)
| Key | Trigger |
|-----|---------|
| `sms_client_booking` | Client pays for booking |
| `sms_client_ride_started` | Driver starts the ride |
| `sms_client_refund` | Admin refunds a booking |
| `sms_cashier_referral` | Cashier referral booked |
| `sms_cashier_paid_via_concierge` | Cashier's concierge paid |
| `sms_guest_payment_link` | Cashier books for guest |
| `sms_driver_new_run` | Driver assigned/accepts a run |
| `sms_driver_ride_completed` | Driver completes a ride |
| `sms_driver_payout_released` | Individual payout released |
| `sms_driver_payout_flagged` | Payout flagged for review |
| `sms_driver_payout_rejected` | Payout rejected |
| `sms_driver_batch_payout` | Batch payout released |
| `sms_driver_run_cancelled` | Admin reassigns driver |
| `sms_concierge_payout` | Concierge batch paid |
| `sms_concierge_batch_link` | Concierge gets public receipt link |

### Key admin endpoints
- `GET /api/admin/dashboard/stats` — overview metrics
- `POST /api/admin/bookings/{id}/refund` — refund a booking
- `POST /api/admin/bookings/{id}/assign-driver` — manual assign
- `POST /api/admin/bookings/{id}/reassign-driver` — change driver
- `POST /api/admin/concierges/{id}/payout` — release concierge batch
- `POST /api/admin/drivers/{id}/payout` — release driver batch

### System requirements
- Server: 2 vCPU, 4 GB RAM, 40 GB SSD (minimum)
- Docker + Docker Compose v2
- Domain with DNS control (4 subdomains)
- Stripe account (for payments)
- Twilio account (for SMS — optional but recommended)
- Google Cloud account (for Maps — optional)
