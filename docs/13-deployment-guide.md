# Deployment & Environment Guide

## Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Client    │  │   Driver    │  │   Admin     │  │  Cashier    │
│  :5173      │  │  :5174      │  │  :5175      │  │  :5176      │
│  React+Vite │  │  React+Vite │  │  React+Vite │  │  React+Vite │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │                │
       └────────────────┴────────┬───────┴────────────────┘
                                 │ /api proxy
                          ┌──────┴──────┐
                          │   Backend   │
                          │  :8000      │
                          │  FastAPI    │
                          └──────┬──────┘
                                 │
                          ┌──────┴──────┐
                          │  PostgreSQL │
                          │  :5432      │
                          └─────────────┘
```

6 services total: 4 frontends + 1 backend + 1 database.

---

## Environment Variables (.env)

Create a `.env` file in the project root. Copy from `.env.example`:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Purpose | Dev Value | Production Value |
|----------|---------|-----------|------------------|
| `DB_PASSWORD` | PostgreSQL password | Any string | Strong random password |
| `JWT_SECRET` | Signs auth tokens for admin/driver/cashier login | Any string | Long random string (64+ chars) |

### Stripe (Payments)

| Variable | Purpose | Dev Value | Production Value |
|----------|---------|-----------|------------------|
| `STRIPE_SECRET_KEY` | Processes customer payments | `sk_test_placeholder` | `sk_live_...` from [Stripe Dashboard](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook callbacks | `whsec_placeholder` | `whsec_...` from [Stripe Webhooks](https://dashboard.stripe.com/webhooks) |

**Dev mode behavior:** When `STRIPE_SECRET_KEY` is `sk_test_placeholder` or empty:
- Payments are simulated — a dev-confirm URL auto-completes payment
- Stripe Connect accounts are simulated — instant "connected" with fake data
- Stripe Transfers are simulated — logged to console, not sent

**Production setup:**
1. Create account at https://stripe.com
2. Get API keys from Dashboard → Developers → API Keys
3. Set up webhook:
   - URL: `https://yourdomain.com/api/payments/webhook`
   - Events: `checkout.session.completed`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`
4. For Stripe Connect (driver/cashier payouts):
   - Enable Connect in Stripe Dashboard → Connect → Get Started
   - Choose "Express" account type
   - No extra env vars needed — uses the same `STRIPE_SECRET_KEY`

### Twilio (SMS)

| Variable | Purpose | Dev Value | Production Value |
|----------|---------|-----------|------------------|
| `TWILIO_ACCOUNT_SID` | Twilio account identifier | `placeholder` | `AC...` from [Twilio Console](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | Twilio authentication | `placeholder` | Auth token from Twilio Console |
| `TWILIO_PHONE_NUMBER` | SMS sender number | `+15550000000` | Twilio phone number (buy one ~$1/month) |

**Dev mode behavior:** When `TWILIO_ACCOUNT_SID` is `placeholder` or empty:
- SMS messages are printed to backend console: `[SMS DEV] To: +251... Message: ...`
- All messages still logged in `notification_log` database table

**Production setup:**
1. Sign up at https://www.twilio.com
2. Copy Account SID and Auth Token from dashboard
3. Buy a phone number with SMS capability
4. For trial accounts: verify recipient numbers at Console → Phone Numbers → Verified

**SMS messages sent by the system:**

| Event | Recipient | Template (editable in Admin Settings) |
|-------|-----------|---------------------------------------|
| Booking paid | Client | Confirmation + receipt link |
| Ride started | Client | Driver info + rating link |
| Cashier referral | Cashier | Commission earned notification |
| Guest reservation | Guest | Payment link from cashier |
| Run assigned | Driver | New run details + earnings |
| Ride completed | Driver | Completion + earnings summary |

### Google Maps (Address Autocomplete)

| Variable | Purpose | Dev Value | Production Value |
|----------|---------|-----------|------------------|
| `GOOGLE_MAPS_API_KEY` | Address autocomplete + distance | `placeholder` | `AIzaSy...` from [Google Cloud Console](https://console.cloud.google.com) |

**Dev mode behavior:** When key is `placeholder` or empty:
- Address inputs are plain text (no autocomplete)
- Distance calculated using rough coordinate math (~69 mi/degree)

**Production setup:**
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create an API key
3. Enable these APIs:
   - Places API (address autocomplete)
   - Geocoding API (reverse geocode for country detection)
   - Distance Matrix API (accurate distance calculation)
4. Restrict the key to your domain for security

---

## Complete .env File

### Development
```bash
DB_PASSWORD=rideflow_dev_2026
JWT_SECRET=dev-jwt-secret-not-for-production

STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder

TWILIO_ACCOUNT_SID=placeholder
TWILIO_AUTH_TOKEN=placeholder
TWILIO_PHONE_NUMBER=+15550000000

GOOGLE_MAPS_API_KEY=placeholder
```

### Production
```bash
DB_PASSWORD=<generate-strong-random-password>
JWT_SECRET=<generate-64-char-random-string>

STRIPE_SECRET_KEY=sk_live_abc123...
STRIPE_WEBHOOK_SECRET=whsec_xyz789...

TWILIO_ACCOUNT_SID=AC1234567890abcdef...
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567

GOOGLE_MAPS_API_KEY=AIzaSyB1234...
```

Generate secrets:
```bash
# JWT secret
openssl rand -hex 32

# DB password
openssl rand -base64 24
```

---

## Running in Development Mode

Dev mode runs the database + backend in Docker, and frontends locally with hot reload.

```bash
# 1. Start database + backend
docker compose up -d db backend

# 2. Run migrations (first time or after model changes)
docker compose exec backend alembic upgrade head

# 3. Seed default data (first time only)
docker compose exec backend python -m app.seed

# 4. Start frontends (each in a separate terminal, or background)
cd frontend/client && npx vite --host 0.0.0.0 --port 5173 &
cd frontend/driver && npx vite --host 0.0.0.0 --port 5174 &
cd frontend/admin && npx vite --host 0.0.0.0 --port 5175 &
cd frontend/cashier && npx vite --host 0.0.0.0 --port 5176 &
```

Or use the start script:
```bash
./start.sh dev
```

**URLs:**
- Client: http://localhost:5173
- Driver: http://localhost:5174
- Admin: http://localhost:5175
- Cashier: http://localhost:5176
- API: http://localhost:8000
- API Docs (Swagger): http://localhost:8000/docs
- SMS Test: `POST http://localhost:8000/api/test-sms?phone=+251...&message=Hello` (dev only)

**Default admin:** `admin@rideflow.com` / `changeme`

---

## Running in Production (Docker Compose)

All 6 services run in Docker containers.

### Step 1: Prepare .env

Create `.env` with real production values (see above).

### Step 2: Build and start

```bash
# Build all images
docker compose build

# Start all services
docker compose up -d

# Wait for database to be healthy, then run migrations
docker compose exec backend alembic upgrade head

# Seed default data (first time only)
docker compose exec backend python -m app.seed
```

Or use the start script:
```bash
./start.sh docker
```

### Step 3: Verify

```bash
# Check all services are running
docker compose ps

# Check backend health
curl http://localhost:8000/api/health

# Check logs
docker compose logs -f backend
```

### Step 4: Configure Stripe Webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://yourdomain.com/api/payments/webhook`
3. Select event: `checkout.session.completed`
4. Copy signing secret → update `STRIPE_WEBHOOK_SECRET` in `.env`
5. Restart backend: `docker compose restart backend`

### Step 5: Configure admin settings

1. Login to admin at `https://yourdomain.com:5175` (or behind your reverse proxy)
2. Go to Settings:
   - Set company name, phone, logo URL
   - Set service area countries
   - Enable/disable Stripe Connect, SMS
   - Customize SMS templates
3. Go to Pricing:
   - Set vehicle rates (base fare + per mile)
   - Add common routes with fixed prices
   - Configure extras/add-ons

---

## Production with Reverse Proxy (Nginx)

For production, put all services behind Nginx on a single domain:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # API backend
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Client booking portal (default)
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
    }
}

server {
    listen 443 ssl;
    server_name driver.yourdomain.com;
    # ... same ssl config ...
    location / { proxy_pass http://localhost:5174; }
    location /api/ { proxy_pass http://localhost:8000; }
}

server {
    listen 443 ssl;
    server_name admin.yourdomain.com;
    location / { proxy_pass http://localhost:5175; }
    location /api/ { proxy_pass http://localhost:8000; }
}

server {
    listen 443 ssl;
    server_name cashier.yourdomain.com;
    location / { proxy_pass http://localhost:5176; }
    location /api/ { proxy_pass http://localhost:8000; }
}
```

With subdomains:
- `yourdomain.com` → Client booking
- `driver.yourdomain.com` → Driver portal
- `admin.yourdomain.com` → Admin dashboard
- `cashier.yourdomain.com` → Cashier portal

All share the same `/api/` backend.

---

## Database Management

```bash
# Access database directly
docker compose exec db psql -U rideflow

# Run migrations
docker compose exec backend alembic upgrade head

# Create new migration (after model changes)
docker compose exec backend alembic revision --autogenerate -m "description"

# Seed default data
docker compose exec backend python -m app.seed

# Seed sample test data (dev only)
docker compose exec backend python -m app.seed_dev

# Backup
docker compose exec db pg_dump -U rideflow rideflow > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T db psql -U rideflow rideflow < backup.sql
```

---

## Application Settings (Admin Dashboard)

These are set in the admin portal (Settings page) and stored in the database. Changes take effect immediately — no restart needed.

### Company
| Setting | Default | Description |
|---------|---------|-------------|
| Company Name | RideFlow | Shown on all portals, SMS, QR codes |
| Company Phone | (empty) | Shown in client confirmation, help sections |
| Company Logo URL | (empty) | Logo shown in all portal headers |

### Service Area
| Setting | Default | Description |
|---------|---------|-------------|
| Available Countries | US, ET, GB, CA | Countries where address autocomplete works. Clients can only book within these countries. |
| Allow Cross-Country Booking | false | If false, pickup and destination must be in the same country |

### Payment & Commissions
| Setting | Default | Description |
|---------|---------|-------------|
| Driver Pay % | 70 | Default percentage drivers receive (overridable per driver) |
| Cashier Commission % | 10 | Default cashier commission (overridable per hotel/cashier) |
| Cashier Commissions | true | Global toggle |
| Max Active Runs / Driver | 5 | Prevents one driver from hoarding all runs |

### Booking
| Setting | Default | Description |
|---------|---------|-------------|
| Booking Window (days) | 30 | How far ahead clients can book |
| Cancellation Window (hours) | 2 | Hours before pickup for full refund |
| Unassigned Alert (min) | 15 | Alert admin if no driver after X minutes |
| Review Expiry (days) | 3 | Days after ride that clients can submit reviews |

### Stripe Connect
| Setting | Default | Description |
|---------|---------|-------------|
| Stripe Connect Payouts | true | Enable Stripe Connect for automatic driver/cashier payouts |

### SMS Templates
All SMS messages are customizable with variable placeholders. See Admin Settings → SMS Templates section.

---

## Stripe Connect Flow (for payouts)

### How it works:
1. Driver/Cashier opens their Profile → taps "Connect with Stripe"
2. System creates a Stripe Express account
3. User redirected to Stripe's hosted onboarding (bank details, identity)
4. After completion, redirected back to profile
5. Profile shows: connected status, bank name, last 4 digits

### What happens on payout:
- **Driver payout:** Admin clicks "Release" → if driver has Stripe → money transferred automatically
- **Cashier commission:** On client payment → if cashier has Stripe → transferred immediately
- **No Stripe:** Payout marked in DB as released, admin handles manually

### Stripe Dashboard requirements:
1. Enable Stripe Connect: Dashboard → Connect → Get started
2. Choose "Express" account type
3. Webhook for payments: `https://yourdomain.com/api/payments/webhook` → event: `checkout.session.completed`

---

## Stopping Services

```bash
# Stop everything (Docker)
docker compose down

# Stop and remove volumes (deletes database!)
docker compose down -v

# Stop only frontends (if running locally)
./stop.sh
```

---

## Troubleshooting

### Backend won't start
```bash
docker compose logs backend
```
- Database not ready: wait and retry
- Missing migration: `docker compose exec backend alembic upgrade head`
- Port conflict: check `netstat -ano | grep 8000`

### Payments not working
- **Dev mode:** Payments auto-confirm via dev-confirm URL
- **Production:** Check `STRIPE_SECRET_KEY` is real (not placeholder)
- **Webhook not firing:** Run `stripe listen --forward-to localhost:8000/api/payments/webhook` for local testing

### SMS not sending
- **Dev mode:** Check backend logs for `[SMS DEV]` messages
- **Production:** Verify Twilio credentials are real
- **Trial account:** Recipient must be verified at twilio.com/console
- Check DB: `SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 10;`

### Address autocomplete not working
- Check `GOOGLE_MAPS_API_KEY` in `.env` is a real key (not placeholder)
- Verify APIs enabled in Google Cloud Console: Places, Geocoding, Distance Matrix
- Check browser console for Google Maps errors

### Stripe Connect issues
- Check `stripe_connect_enabled` is `true` in admin Settings
- Driver/cashier must complete full Stripe onboarding (identity + bank)
- Check backend logs for `[STRIPE DEV]` or error messages
- Verify Stripe Connect is enabled in your Stripe Dashboard

### Database connection refused
```bash
docker compose ps          # check containers running
docker compose logs db     # check for errors
```
