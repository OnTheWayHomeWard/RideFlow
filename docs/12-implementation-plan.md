# 12 — Implementation Plan

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend API** | Python + FastAPI | Async, fast, auto-generated OpenAPI docs, great for this scale |
| **ORM** | SQLAlchemy 2.0 (async) | Code-first models, Alembic for migrations |
| **Database** | PostgreSQL 16 | Reliable, JSONB support, great for reporting |
| **Frontend (3 apps)** | React 18 + Vite + Tailwind CSS | Fast build, mobile-first, great DX |
| **Auth** | JWT (python-jose) + passlib/bcrypt | Stateless auth for driver/admin/cashier portals |
| **Payments** | Stripe Checkout + Connect | PCI compliant, split payments built-in |
| **SMS** | Twilio | Reliable, simple Python SDK |
| **Maps** | Google Maps Platform | Places autocomplete, Distance Matrix, geocoding |
| **Real-time** | WebSockets (FastAPI native) | Driver notifications for new runs |
| **File Storage** | AWS S3 or Cloudinary | QR codes, driver/vehicle photos, license uploads |
| **Containerization** | Docker + Docker Compose | Consistent dev/prod environments |
| **Reverse Proxy** | Nginx | Serve frontends, proxy API, SSL termination |
| **Task Queue** | Celery + Redis (optional, later) | Background jobs: SMS sending, payout processing |

### Why FastAPI over Node/Express?

- Auto-generated Swagger/OpenAPI docs at `/docs` — backend team gets interactive API docs for free
- Pydantic models = request/response validation baked in
- Async by default — handles concurrent requests well
- Python ecosystem for data/reporting later
- Perfectly fine for this project's scale (50 cars, not 50,000)

---

## Project Structure

```
rideflow/
│
├── docker-compose.yml              # Orchestrates everything
├── .env.example                    # Template for environment variables
├── .env                            # Local env (git-ignored)
│
├── backend/                        # FastAPI application
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini                 # Alembic config
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/               # Migration files (auto-generated)
│   │
│   └── app/
│       ├── main.py                 # FastAPI app entry point
│       ├── config.py               # Settings (from env vars)
│       ├── database.py             # SQLAlchemy engine, session
│       │
│       ├── models/                 # SQLAlchemy models (code-first)
│       │   ├── __init__.py
│       │   ├── admin.py
│       │   ├── booking.py
│       │   ├── cashier.py
│       │   ├── driver.py
│       │   ├── hotel.py
│       │   ├── payment.py
│       │   ├── rating.py
│       │   ├── vehicle_rate.py
│       │   ├── common_route.py
│       │   ├── upsale.py
│       │   ├── extra.py
│       │   ├── setting.py
│       │   └── geofence.py
│       │
│       ├── schemas/                # Pydantic request/response models
│       │   ├── __init__.py
│       │   ├── booking.py
│       │   ├── driver.py
│       │   ├── cashier.py
│       │   ├── payment.py
│       │   ├── pricing.py
│       │   ├── admin.py
│       │   └── auth.py
│       │
│       ├── routers/                # API route handlers
│       │   ├── __init__.py
│       │   ├── bookings.py         # Public booking endpoints
│       │   ├── pricing.py          # Price calculation
│       │   ├── drivers.py          # Driver portal endpoints
│       │   ├── cashiers.py         # Cashier portal endpoints
│       │   ├── admin.py            # Admin dashboard endpoints
│       │   ├── payments.py         # Stripe webhooks
│       │   ├── ratings.py          # Rating endpoints
│       │   └── auth.py             # Login/register
│       │
│       ├── services/               # Business logic
│       │   ├── __init__.py
│       │   ├── pricing_service.py  # Price calculation engine
│       │   ├── payment_service.py  # Stripe integration
│       │   ├── split_service.py    # Payment splitting logic
│       │   ├── sms_service.py      # Twilio SMS
│       │   ├── dispatch_service.py # Run broadcast to drivers
│       │   ├── geofence_service.py # Location validation
│       │   ├── qr_service.py       # QR code generation
│       │   └── maps_service.py     # Google Maps API calls
│       │
│       ├── middleware/
│       │   └── auth.py             # JWT dependency injection
│       │
│       └── utils/
│           ├── security.py         # Password hashing, JWT creation
│           └── helpers.py          # Booking number generator, etc.
│
├── frontend/
│   ├── client/                     # Client booking site
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── tailwind.config.js
│   │   └── src/
│   │       ├── main.jsx
│   │       ├── App.jsx
│   │       ├── pages/
│   │       │   ├── BookingWizard.jsx    # Screens 1-3
│   │       │   ├── Confirmation.jsx     # Screen 4
│   │       │   └── Rating.jsx           # Post-ride rating
│   │       ├── components/
│   │       │   ├── AddressInput.jsx     # Google Places autocomplete
│   │       │   ├── PopularRoutes.jsx
│   │       │   ├── VehicleCard.jsx
│   │       │   ├── TripDetails.jsx
│   │       │   └── PriceSummary.jsx
│   │       ├── hooks/
│   │       │   ├── useGeolocation.js
│   │       │   └── useBooking.js
│   │       └── api/
│   │           └── client.js            # Axios/fetch wrapper
│   │
│   ├── driver/                     # Driver portal
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Login.jsx
│   │       │   ├── Register.jsx
│   │       │   ├── Dashboard.jsx
│   │       │   ├── ActiveRide.jsx
│   │       │   ├── Schedule.jsx
│   │       │   ├── Earnings.jsx
│   │       │   └── History.jsx
│   │       ├── components/
│   │       │   ├── RunCard.jsx
│   │       │   ├── ScheduleItem.jsx
│   │       │   └── EarningsCard.jsx
│   │       └── hooks/
│   │           ├── useWebSocket.js      # Real-time run updates
│   │           └── useAuth.js
│   │
│   └── admin/                      # Admin dashboard
│       ├── Dockerfile
│       ├── package.json
│       └── src/
│           ├── pages/
│           │   ├── Login.jsx
│           │   ├── Dashboard.jsx
│           │   ├── Runs.jsx
│           │   ├── Drivers.jsx
│           │   ├── Cashiers.jsx
│           │   ├── Hotels.jsx
│           │   ├── Pricing.jsx
│           │   ├── Upsales.jsx
│           │   ├── PayoutRequests.jsx   # Review & release payouts
│           │   ├── Reports.jsx
│           │   └── Settings.jsx
│           └── components/
│               ├── StatsCard.jsx
│               ├── DataTable.jsx
│               ├── PayoutRequestCard.jsx
│               └── Charts.jsx
│
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf                  # Reverse proxy config
│
└── docs/                           # Documentation (these files)
```

---

## Docker Setup

### docker-compose.yml

```yaml
services:

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: rideflow
      POSTGRES_USER: rideflow
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://rideflow:${DB_PASSWORD}@db:5432/rideflow
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET}
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
      TWILIO_PHONE_NUMBER: ${TWILIO_PHONE_NUMBER}
      GOOGLE_MAPS_API_KEY: ${GOOGLE_MAPS_API_KEY}
      JWT_SECRET: ${JWT_SECRET}
      S3_BUCKET: ${S3_BUCKET}
    depends_on:
      - db
      - redis

  client:
    build: ./frontend/client
    command: npm run dev -- --host 0.0.0.0 --port 5173
    volumes:
      - ./frontend/client:/app
      - /app/node_modules
    ports:
      - "5173:5173"

  driver:
    build: ./frontend/driver
    command: npm run dev -- --host 0.0.0.0 --port 5174
    volumes:
      - ./frontend/driver:/app
      - /app/node_modules
    ports:
      - "5174:5174"

  admin:
    build: ./frontend/admin
    command: npm run dev -- --host 0.0.0.0 --port 5175
    volumes:
      - ./frontend/admin:/app
      - /app/node_modules
    ports:
      - "5175:5175"

  nginx:
    build: ./nginx
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
      - client
      - driver
      - admin

volumes:
  postgres_data:
```

### Backend Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend Dockerfile (same for client/driver/admin)

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "run", "dev"]
```

---

## Implementation Phases (Step by Step)

The order matters. Each phase builds on the previous one. Don't skip ahead.

---

### Phase 0: Project Scaffolding (Day 1)

**Goal: Everything running in Docker, empty but wired up.**

```
✅ After this phase: `docker compose up` starts everything,
   API returns "hello world", frontends show a blank page.
```

- [ ] Create repo and project structure (all folders, all files)
- [ ] Set up `docker-compose.yml` with all services
- [ ] Set up backend:
  - `requirements.txt`: fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, alembic, pydantic, python-jose, passlib, python-multipart, stripe, twilio, httpx
  - `app/main.py`: FastAPI app with health check endpoint
  - `app/config.py`: Settings from env vars (pydantic-settings)
  - `app/database.py`: async SQLAlchemy engine + session maker
- [ ] Set up Alembic for migrations (`alembic init`)
- [ ] Set up all 3 frontend apps:
  - `npm create vite@latest` for each (client, driver, admin)
  - Install Tailwind CSS in each
  - Install React Router DOM in each
  - Basic layout component with routing shell
- [ ] Set up Nginx reverse proxy config
- [ ] Create `.env.example` with all required variables
- [ ] `docker compose up` — verify everything starts

**Deliverable: Full dev environment running in Docker.**

---

### Phase 1: Database Models + Migrations (Day 2-3)

**Goal: All tables created via code-first SQLAlchemy models.**

Build models in this order (respecting foreign key dependencies):

```
1. settings       (no FK)
2. admins          (no FK)
3. vehicle_rates   (no FK)
4. extras          (no FK)
5. geofence        (no FK)
6. hotels          (no FK)
7. common_routes   (no FK)
8. upsales         (FK → admins)
9. cashiers        (FK → hotels, admins)
10. drivers        (FK → admins)
11. bookings       (FK → common_routes, upsales, cashiers, hotels, drivers)
12. payments       (FK → bookings)
13. payment_splits (FK → payments, bookings, admins)
14. ratings        (FK → bookings, drivers)
15. notification_log (no FK, references by ID)
```

- [ ] Create all SQLAlchemy models in `app/models/`
- [ ] Create Pydantic schemas in `app/schemas/` for each model (Create, Read, Update variants)
- [ ] Generate first Alembic migration: `alembic revision --autogenerate -m "initial schema"`
- [ ] Run migration: `alembic upgrade head`
- [ ] Create seed script (`app/seed.py`) to populate:
  - Default admin account (email: admin@rideflow.com, password: changeme)
  - Vehicle rates (Sedan, SUV, Van, Large Van)
  - Default extras (room pickup, extra luggage, child seat)
  - Default settings (all the key-value pairs from doc 08)
  - A few sample common routes
  - A sample geofence polygon
- [ ] Run seed: `python -m app.seed`
- [ ] Verify all tables exist with correct columns

**Deliverable: Full database schema, seeded with default data.**

---

### Phase 2: Core API — Pricing + Booking Creation (Day 4-7)

**Goal: API can calculate prices and create bookings. No payment yet — just the data flow.**

- [ ] `GET /api/vehicle-rates` — list active vehicle types with rates
- [ ] `GET /api/extras` — list active extras
- [ ] `GET /api/common-routes` — list active routes with fixed prices
- [ ] `GET /api/cashiers/{ref_code}/validate` — validate a cashier ref code, return hotel info
- [ ] `POST /api/pricing/calculate` — calculate price for a route:
  - Input: pickup coords, dropoff coords, vehicle type, extras chosen
  - Logic: check if it matches a common route (use fixed price) → else calculate distance × rate + base fare
  - Apply active upsale silently (check `upsales` table for current time)
  - Return: price breakdown (vehicle price, extras, total) — no upsale line
- [ ] `POST /api/bookings` — create a booking:
  - Input: all client info, route, vehicle, extras, cashier ref (optional)
  - Validate geofence for both pickup and dropoff
  - Calculate final price (call pricing service)
  - Generate booking number (RF-YYYYMMDD-XXXX)
  - Save to DB with status `pending`
  - Return: booking ID, booking number, total amount
- [ ] Google Maps integration (`app/services/maps_service.py`):
  - Distance Matrix API call for custom routes
  - Cache results for repeated lookups
- [ ] Geofence validation (`app/services/geofence_service.py`):
  - Point-in-polygon check against stored geofence

**Deliverable: API calculates prices and creates bookings in the database.**

---

### Phase 3: Stripe Payment Integration (Day 8-10)

**Goal: Client can pay, payment is confirmed via webhook, cashier gets paid immediately.**

- [ ] `POST /api/payments/create-checkout` — create Stripe Checkout session:
  - Input: booking ID
  - Create Stripe session with booking amount
  - Return: Stripe checkout URL (frontend redirects to it)
- [ ] `POST /api/payments/webhook` — Stripe webhook handler:
  - Verify Stripe signature
  - On `checkout.session.completed`:
    - Update payment status → `captured`
    - Update booking status → `paid`
    - Calculate payment splits (cashier, driver, company)
    - Save splits to `payment_splits` table
    - If cashier exists: trigger immediate payout (Stripe transfer or mark as paid)
    - Send SMS to client: "Ride booked!"
    - Broadcast run to eligible drivers (via WebSocket)
- [ ] `GET /api/bookings/{booking_number}/status` — check booking status (for confirmation page)
- [ ] Stripe Connect setup for cashier/driver payouts (or manual tracking for MVP)

**Deliverable: End-to-end payment flow — client pays, booking confirmed, cashier paid.**

---

### Phase 4: Client Booking Frontend (Day 11-16)

**Goal: Full client booking experience — the 4-screen wizard.**

- [ ] **Screen 1: Route selection**
  - Google Places Autocomplete component (`AddressInput.jsx`)
  - Two variants: QR scan (pickup pre-filled) vs direct visit (both fields)
  - Parse `?ref=` query param → validate cashier → pre-fill hotel
  - Popular destinations list (from `/api/common-routes`)
  - Geofence validation (call API or client-side check)
  - Browser geolocation for auto-fill (direct visit)
- [ ] **Screen 2: Vehicle selection (Yango-style)**
  - Fetch prices from `/api/pricing/calculate` with the selected route
  - Vehicle cards with images, capacity, price
  - Tap to select → advance to Screen 3
- [ ] **Screen 3: Confirm & Pay**
  - Date/time picker (defaults: today, next 30-min slot)
  - Passenger/luggage tap chips
  - Add-on checkboxes (price updates live)
  - Name, phone, room# fields
  - Price summary (updates in real-time as add-ons toggle)
  - "Pay" button → calls `/api/payments/create-checkout` → redirects to Stripe
- [ ] **Screen 4: Confirmation**
  - Polls `/api/bookings/{number}/status` until `paid`
  - Shows booking details, "SMS coming" message
- [ ] **Rating page** (separate route: `/rate/:bookingNumber?token=xxx`)
  - Fetch ride details
  - Star rating + optional comment
  - Submit → `POST /api/ratings`
- [ ] Mobile-responsive Tailwind styling throughout

**Deliverable: A client can visit the site, book a ride, and pay.**

---

### Phase 5: Driver Portal — Registration + Auth (Day 17-19)

**Goal: Drivers can register and log in.**

- [ ] Backend:
  - `POST /api/drivers/register` — full registration with vehicle, license, payout info, photo uploads
  - `POST /api/drivers/login` — phone + password → JWT
  - `GET /api/drivers/me` — current driver profile
  - File upload endpoint for photos (license, vehicle, profile)
- [ ] Frontend:
  - Registration form (all fields from doc 02)
  - Photo upload components
  - Login page (phone + password)
  - Auth context/hook (store JWT, redirect if not logged in)
  - Basic dashboard shell (logged-in layout with nav tabs)

**Deliverable: Drivers can register, admin sees pending registrations.**

---

### Phase 6: Driver Portal — Accept Runs + Ride Lifecycle (Day 20-24)

**Goal: Drivers can see available runs, accept, start, and complete rides.**

- [ ] Backend:
  - `GET /api/drivers/available-runs` — unassigned runs matching driver's vehicle type
  - `POST /api/drivers/runs/{id}/accept` — first-accept-wins (check if still unassigned, assign)
  - `POST /api/drivers/runs/{id}/start` — record GPS, set status `in_progress`
  - `POST /api/drivers/runs/{id}/complete` — record GPS, set status `completed`, create payout request (`pending_review`)
  - `GET /api/drivers/my-runs` — all accepted/upcoming/past runs
  - `GET /api/drivers/schedule` — upcoming runs sorted by date
  - `GET /api/drivers/earnings` — earnings summary (today, week, month) — only driver's cut, never total fare
  - WebSocket endpoint: broadcast new runs to online drivers in real-time
- [ ] Frontend:
  - Dashboard: available runs list (only their vehicle type, only their earnings shown)
  - Run card component (route, date/time, passengers, "You earn: $X")
  - Accept flow (tap → confirm → assigned)
  - Schedule tab (upcoming runs by date)
  - Active ride screen (Start Ride → Complete Ride buttons)
  - GPS capture on start/complete (browser geolocation)
  - Earnings tab (totals + per-ride history — only their cut)
  - WebSocket hook for real-time run notifications

**Deliverable: Full driver lifecycle — register, accept, drive, complete.**

---

### Phase 7: Admin Dashboard — Core Management (Day 25-30)

**Goal: Admin can manage everything and review payout requests.**

- [ ] Backend:
  - Admin login + JWT
  - `GET/PUT /api/admin/drivers` — list, approve, reject, edit, deactivate
  - `GET/PUT /api/admin/cashiers` — list, approve, reject
  - `GET/POST/PUT /api/admin/hotels` — CRUD
  - `GET/PUT /api/admin/vehicle-rates` — edit rates
  - `GET/POST/PUT/DELETE /api/admin/common-routes` — CRUD
  - `GET/POST/PUT /api/admin/upsales` — CRUD + activate/deactivate
  - `GET/PUT /api/admin/settings` — key-value settings
  - `GET /api/admin/bookings` — list with filters (status, date, driver, hotel)
  - `GET /api/admin/bookings/{id}` — full details
  - **Payout requests:**
    - `GET /api/admin/payouts?status=pending_review` — list pending
    - `PUT /api/admin/payouts/{id}/release` — release driver payment
    - `PUT /api/admin/payouts/{id}/flag` — flag with note
    - `PUT /api/admin/payouts/{id}/reject` — reject with reason
- [ ] Frontend:
  - Admin login page
  - Sidebar navigation (all sections)
  - Dashboard: stat cards (today/week/month rides, revenue), recent activity feed
  - **Payout Requests page** — list pending requests, client phone (tap to call), GPS verification, Release/Flag/Reject buttons
  - Runs page: table with filters
  - Drivers page: table, approve/reject modal, edit drawer
  - Cashiers page: table, approve/reject, generate QR download
  - Hotels page: CRUD table
  - Pricing page: editable vehicle rates, extras
  - Common Routes page: CRUD with map preview
  - Upsales page: create with date/time, flat/%, toggle driver/cashier inclusion
  - Settings page: editable key-value settings

**Deliverable: Admin can manage the entire system.**

---

### Phase 8: Cashier System + Hotel QR (Day 31-34)

**Goal: Cashier registration, QR codes, portal.**

- [ ] Backend:
  - `POST /api/cashiers/register` — self-registration
  - `POST /api/cashiers/login` — phone + password → JWT
  - `GET /api/cashiers/me` — profile + QR code URL
  - `GET /api/cashiers/referrals` — bookings from their QR
  - `GET /api/cashiers/earnings` — commission summary
  - QR code generation service (generate PNG with ref code URL embedded)
- [ ] Frontend:
  - Cashier registration page
  - Cashier login
  - Cashier dashboard: QR code (download/print), referral count, earnings
- [ ] Admin:
  - Generate QR for cashier (downloadable PNG)
  - View per-cashier and per-hotel referral stats

**Deliverable: Hotel QR referral system fully working.**

---

### Phase 9: SMS Notifications (Day 35-37)

**Goal: All SMS notifications wired up.**

- [ ] Twilio service (`app/services/sms_service.py`)
- [ ] Client SMS:
  - Booking confirmed
  - Driver assigned (with driver name, vehicle, plate)
  - Ride completed + rating link
  - Cancellation confirmed
- [ ] Driver SMS:
  - New run available (with earnings amount)
  - Registration approved/rejected
  - Run cancelled by client
  - Payout released
- [ ] Admin notifications:
  - New payout request (email or in-app)
  - New driver/cashier registration (email or in-app)
  - Unassigned run alert (if no driver accepts after 15 min)
- [ ] Notification log — store all sent messages in `notification_log` table

**Deliverable: Everyone gets notified at every step.**

---

### Phase 10: Reports + Analytics (Day 38-41)

**Goal: Admin reports and dashboard charts.**

- [ ] Backend report endpoints:
  - `GET /api/admin/reports/rides` — rides per day/week/month, by status, by vehicle
  - `GET /api/admin/reports/revenue` — total revenue, company revenue, driver payouts, cashier payouts, upsale revenue
  - `GET /api/admin/reports/drivers` — per-driver rides, earnings, rating
  - `GET /api/admin/reports/hotels` — per-hotel rides, revenue, cashier performance
  - `GET /api/admin/reports/payouts` — payout summary (released, pending, flagged, rejected)
- [ ] Frontend:
  - Charts (use Recharts): line charts for revenue/rides over time, bar charts for per-driver/hotel
  - Filter by date range
  - Export to CSV (optional)

**Deliverable: Full reporting dashboard.**

---

### Phase 11: Polish + Testing + Launch Prep (Day 42-48)

**Goal: Production-ready.**

- [ ] End-to-end testing: full flow from booking → payment → driver accept → complete → payout release
- [ ] Error handling on all API endpoints (proper HTTP codes, clear error messages)
- [ ] Loading states and empty states on all frontend pages
- [ ] Form validation (frontend + backend)
- [ ] Rate limiting on public endpoints
- [ ] CORS configuration
- [ ] Production Docker setup (multi-stage builds, no dev dependencies)
- [ ] Environment setup:
  - Production Stripe keys (live mode)
  - Production Twilio number
  - Production database (managed PostgreSQL — e.g., AWS RDS, DigitalOcean, Supabase)
  - S3 bucket for file uploads
  - Domain + SSL certificate
- [ ] Create production admin account
- [ ] Seed production data (vehicle rates, routes, extras, geofence, settings)
- [ ] Print QR codes for partner hotels
- [ ] Onboard first batch of drivers (register + approve)

**Deliverable: Live in production.**

---

## API Endpoints Summary

### Public (no auth)
```
GET    /api/vehicle-rates
GET    /api/extras
GET    /api/common-routes
GET    /api/cashiers/{ref_code}/validate
POST   /api/pricing/calculate
POST   /api/bookings
GET    /api/bookings/{booking_number}/status
POST   /api/payments/create-checkout
POST   /api/payments/webhook                    ← Stripe webhook
GET    /api/ratings/{booking_number}?token=xxx
POST   /api/ratings/{booking_number}
```

### Driver (JWT auth)
```
POST   /api/drivers/register
POST   /api/drivers/login
GET    /api/drivers/me
PUT    /api/drivers/me                          ← update profile/payout info
GET    /api/drivers/available-runs
POST   /api/drivers/runs/{id}/accept
POST   /api/drivers/runs/{id}/start
POST   /api/drivers/runs/{id}/complete
GET    /api/drivers/my-runs
GET    /api/drivers/schedule
GET    /api/drivers/earnings
GET    /api/drivers/history
```

### Cashier (JWT auth)
```
POST   /api/cashiers/register
POST   /api/cashiers/login
GET    /api/cashiers/me
GET    /api/cashiers/qr-code
GET    /api/cashiers/referrals
GET    /api/cashiers/earnings
```

### Admin (JWT auth)
```
POST   /api/admin/login
GET    /api/admin/dashboard/stats

GET    /api/admin/bookings
GET    /api/admin/bookings/{id}
PUT    /api/admin/bookings/{id}

GET    /api/admin/payouts
PUT    /api/admin/payouts/{id}/release
PUT    /api/admin/payouts/{id}/flag
PUT    /api/admin/payouts/{id}/reject

GET    /api/admin/drivers
PUT    /api/admin/drivers/{id}
PUT    /api/admin/drivers/{id}/approve
PUT    /api/admin/drivers/{id}/reject

GET    /api/admin/cashiers
PUT    /api/admin/cashiers/{id}/approve
PUT    /api/admin/cashiers/{id}/reject

GET    /api/admin/hotels
POST   /api/admin/hotels
PUT    /api/admin/hotels/{id}
DELETE /api/admin/hotels/{id}

GET    /api/admin/vehicle-rates
PUT    /api/admin/vehicle-rates/{id}

GET    /api/admin/common-routes
POST   /api/admin/common-routes
PUT    /api/admin/common-routes/{id}
DELETE /api/admin/common-routes/{id}

GET    /api/admin/extras
PUT    /api/admin/extras/{id}

GET    /api/admin/upsales
POST   /api/admin/upsales
PUT    /api/admin/upsales/{id}

GET    /api/admin/settings
PUT    /api/admin/settings

GET    /api/admin/reports/rides
GET    /api/admin/reports/revenue
GET    /api/admin/reports/drivers
GET    /api/admin/reports/hotels
GET    /api/admin/reports/payouts
```

---

## Quick Start (Development)

```bash
# 1. Clone the repo
git clone <repo-url>
cd rideflow

# 2. Set up environment
cp .env.example .env
# Fill in: DB_PASSWORD, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
#          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
#          GOOGLE_MAPS_API_KEY, JWT_SECRET

# 3. Start everything
docker compose up --build

# 4. Run database migrations (first time only)
docker compose exec backend alembic upgrade head

# 5. Seed default data (first time only)
docker compose exec backend python -m app.seed

# 6. Access the apps
# API docs:  http://localhost:8000/docs  (Swagger UI — interactive!)
# Client:    http://localhost:5173
# Driver:    http://localhost:5174
# Admin:     http://localhost:5175
# Database:  localhost:5432 (rideflow/rideflow)

# 7. Stripe webhook testing (local)
# Install Stripe CLI, then:
stripe listen --forward-to localhost:8000/api/payments/webhook
```

---

## Key Python Packages

```txt
# backend/requirements.txt
fastapi==0.115.*
uvicorn[standard]==0.34.*
sqlalchemy[asyncio]==2.0.*
asyncpg==0.30.*
alembic==1.14.*
pydantic==2.10.*
pydantic-settings==2.7.*
python-jose[cryptography]==3.3.*
passlib[bcrypt]==1.7.*
python-multipart==0.0.*
stripe==11.*
twilio==9.*
httpx==0.28.*
qrcode[pil]==8.*
boto3==1.35.*
pillow==11.*
```

---

## Timeline Summary

| Phase | What | Days | Running Total |
|-------|------|------|---------------|
| 0 | Project scaffolding + Docker | 1 | Day 1 |
| 1 | Database models + migrations + seed | 2 | Day 3 |
| 2 | Core API: pricing + booking | 4 | Day 7 |
| 3 | Stripe payment integration | 3 | Day 10 |
| 4 | Client booking frontend (4 screens) | 6 | Day 16 |
| 5 | Driver registration + auth | 3 | Day 19 |
| 6 | Driver portal: accept/start/complete | 5 | Day 24 |
| 7 | Admin dashboard: full management + payouts | 6 | Day 30 |
| 8 | Cashier system + hotel QR | 4 | Day 34 |
| 9 | SMS notifications | 3 | Day 37 |
| 10 | Reports + analytics | 4 | Day 41 |
| 11 | Polish + testing + launch | 7 | **Day 48** |

**~7 weeks** from first line of code to production. Adjust based on team size — a solo dev might take 10-12 weeks; a team of 2-3 can hit 7 weeks.
