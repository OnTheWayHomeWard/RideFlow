# 08 — Database Design

## Overview
PostgreSQL database. Clean relational schema with proper foreign keys and indexes.

---

## Entity Relationship Diagram (Text)

```
┌──────────┐     ┌──────────────┐     ┌──────────┐
│  hotels  │────<│   cashiers   │     │  drivers  │
└──────────┘     └──────┬───────┘     └─────┬────┘
                        │                    │
                        │                    │
                 ┌──────┴────────────────────┴──────┐
                 │            bookings               │
                 └──────┬───────────────────────────┘
                        │
              ┌─────────┼─────────┐
              │         │         │
       ┌──────┴──┐ ┌────┴─────┐ ┌┴──────────┐
       │payments │ │ride_logs │ │  ratings   │
       └────┬────┘ └──────────┘ └────────────┘
            │
    ┌───────┴────────┐
    │ payment_splits │
    └────────────────┘

┌───────────────┐  ┌──────────────┐  ┌─────────────┐
│ vehicle_rates │  │common_routes │  │   upsales   │
└───────────────┘  └──────────────┘  └─────────────┘

┌──────────────┐  ┌─────────────┐
│    extras    │  │   admins    │
└──────────────┘  └─────────────┘

┌──────────────────┐
│  settings (KV)   │
└──────────────────┘
```

---

## Full Schema

### admins

```sql
CREATE TABLE admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'admin',  -- 'admin', 'super_admin'
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### hotels

```sql
CREATE TABLE hotels (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   VARCHAR(200) NOT NULL,
  address                TEXT NOT NULL,
  lat                    DECIMAL(10,7),
  lng                    DECIMAL(10,7),
  contact_name           VARCHAR(100),
  contact_phone          VARCHAR(20),
  default_commission_pct DECIMAL(5,2) DEFAULT 10.00,
  is_active              BOOLEAN DEFAULT true,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
```

### cashiers

```sql
CREATE TABLE cashiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        UUID REFERENCES hotels(id),
  name            VARCHAR(100) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(255),
  password_hash   VARCHAR(255),
  ref_code        VARCHAR(20) UNIQUE NOT NULL,  -- for QR code
  commission_pct  DECIMAL(5,2),                 -- override hotel default
  status          VARCHAR(20) DEFAULT 'pending', -- pending, active, inactive
  total_referrals INTEGER DEFAULT 0,
  total_earnings  DECIMAL(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  approved_by     UUID REFERENCES admins(id)
);
CREATE INDEX idx_cashiers_ref_code ON cashiers(ref_code);
CREATE INDEX idx_cashiers_hotel ON cashiers(hotel_id);
```

### drivers

```sql
CREATE TABLE drivers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Personal
  name              VARCHAR(100) NOT NULL,
  phone             VARCHAR(20) UNIQUE NOT NULL,
  email             VARCHAR(255),
  password_hash     VARCHAR(255) NOT NULL,
  photo_url         TEXT,

  -- Vehicle
  vehicle_type      VARCHAR(20) NOT NULL,  -- sedan, suv, van, large_van
  vehicle_make      VARCHAR(100),          -- "Ford Transit 2023"
  vehicle_plate     VARCHAR(20),
  vehicle_color     VARCHAR(30),
  vehicle_photo_url TEXT,                  -- photo of actual vehicle

  -- Credentials
  license_number    VARCHAR(50),
  license_expiry    DATE,
  license_photo_url TEXT,                  -- front & back
  has_insurance     BOOLEAN DEFAULT false,

  -- Payout
  pay_percentage    DECIMAL(5,2) DEFAULT 70.00,
  payout_method     VARCHAR(20) DEFAULT 'bank',  -- bank, zelle, stripe_connect
  payout_details    JSONB,                 -- {bank_name, routing, account} or {zelle_email}
  stripe_connect_id VARCHAR(255),          -- if using Stripe Connect

  -- Status
  status            VARCHAR(20) DEFAULT 'pending', -- pending, active, inactive, suspended
  is_online         BOOLEAN DEFAULT false,
  rejection_reason  TEXT,                  -- if admin rejected registration

  -- Stats
  rating_avg        DECIMAL(3,2) DEFAULT 0,
  total_rides       INTEGER DEFAULT 0,
  total_earnings    DECIMAL(10,2) DEFAULT 0,

  -- Timestamps
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  approved_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES admins(id),
  last_online_at    TIMESTAMPTZ
);
CREATE INDEX idx_drivers_status ON drivers(status, is_online);
CREATE INDEX idx_drivers_vehicle ON drivers(vehicle_type);
```

### vehicle_rates

```sql
CREATE TABLE vehicle_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type    VARCHAR(20) UNIQUE NOT NULL,
  display_name    VARCHAR(50) NOT NULL,    -- "Sedan", "SUV", etc.
  base_fare       DECIMAL(10,2) NOT NULL,
  per_mile_rate   DECIMAL(10,2) NOT NULL,
  max_passengers  INTEGER NOT NULL,
  icon            VARCHAR(10),             -- emoji or icon name
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### extras

```sql
CREATE TABLE extras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(50) UNIQUE NOT NULL,  -- "room_pickup", "extra_luggage"
  price       DECIMAL(10,2) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true
);
```

### common_routes

```sql
CREATE TABLE common_routes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,       -- "Airport → Downtown"
  from_name     VARCHAR(200) NOT NULL,
  from_address  TEXT NOT NULL,
  from_lat      DECIMAL(10,7),
  from_lng      DECIMAL(10,7),
  to_name       VARCHAR(200) NOT NULL,
  to_address    TEXT NOT NULL,
  to_lat        DECIMAL(10,7),
  to_lng        DECIMAL(10,7),
  distance_miles DECIMAL(6,1),
  prices        JSONB NOT NULL,              -- {"sedan": 35, "suv": 45, "van": 55}
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### upsales

```sql
CREATE TABLE upsales (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(200) NOT NULL,
  type                 VARCHAR(20) NOT NULL,  -- 'flat' or 'percentage'
  amount               DECIMAL(10,2) NOT NULL,
  start_time           TIMESTAMPTZ NOT NULL,
  end_time             TIMESTAMPTZ NOT NULL,
  vehicle_types        JSONB,                 -- null = all, ["sedan","suv"] = specific
  driver_gets_upsale   BOOLEAN DEFAULT false,
  cashier_gets_upsale  BOOLEAN DEFAULT true,
  is_active            BOOLEAN DEFAULT true,
  created_by           UUID REFERENCES admins(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_upsales_time ON upsales(start_time, end_time);
```

### bookings

```sql
CREATE TABLE bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number    VARCHAR(20) UNIQUE NOT NULL,  -- "RF-20260324-0042"

  -- Client info (no account needed)
  client_name       VARCHAR(100) NOT NULL,
  client_phone      VARCHAR(20) NOT NULL,
  client_room       VARCHAR(20),

  -- Route
  pickup_name       VARCHAR(200) NOT NULL,
  pickup_address    TEXT NOT NULL,
  pickup_lat        DECIMAL(10,7),
  pickup_lng        DECIMAL(10,7),
  dropoff_name      VARCHAR(200) NOT NULL,
  dropoff_address   TEXT NOT NULL,
  dropoff_lat       DECIMAL(10,7),
  dropoff_lng       DECIMAL(10,7),
  distance_miles    DECIMAL(6,1),

  -- Schedule
  pickup_date       DATE NOT NULL,
  pickup_time       TIME NOT NULL,

  -- Trip details
  passengers        INTEGER NOT NULL DEFAULT 1,
  luggage           VARCHAR(20) DEFAULT 'none',  -- none, light, heavy
  vehicle_type      VARCHAR(20) NOT NULL,

  -- Pricing
  base_amount       DECIMAL(10,2) NOT NULL,
  extras_amount     DECIMAL(10,2) DEFAULT 0,
  upsale_amount     DECIMAL(10,2) DEFAULT 0,
  total_amount      DECIMAL(10,2) NOT NULL,
  common_route_id   UUID REFERENCES common_routes(id),
  upsale_id         UUID REFERENCES upsales(id),

  -- Extras chosen
  extras_chosen     JSONB,  -- ["room_pickup", "child_seat"]

  -- Relationships
  cashier_id        UUID REFERENCES cashiers(id),
  hotel_id          UUID REFERENCES hotels(id),
  driver_id         UUID REFERENCES drivers(id),

  -- Status
  status            VARCHAR(20) DEFAULT 'pending',
  -- pending → paid → assigned → in_progress → completed
  -- pending → cancelled
  -- paid → expired (no driver accepted)

  -- Timestamps
  paid_at           TIMESTAMPTZ,
  assigned_at       TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,

  -- Location tracking
  start_location    JSONB,  -- {lat, lng} when driver starts ride
  end_location      JSONB,  -- {lat, lng} when driver completes ride

  -- Meta
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_driver ON bookings(driver_id);
CREATE INDEX idx_bookings_cashier ON bookings(cashier_id);
CREATE INDEX idx_bookings_hotel ON bookings(hotel_id);
CREATE INDEX idx_bookings_date ON bookings(pickup_date);
CREATE INDEX idx_bookings_number ON bookings(booking_number);
```

### payments

```sql
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID REFERENCES bookings(id) NOT NULL,
  stripe_payment_id VARCHAR(255),
  stripe_session_id VARCHAR(255),
  amount            DECIMAL(10,2) NOT NULL,
  currency          VARCHAR(3) DEFAULT 'USD',
  status            VARCHAR(20) DEFAULT 'pending',  -- pending, captured, refunded, failed
  refund_amount     DECIMAL(10,2),
  refunded_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_id);
```

### payment_splits

```sql
CREATE TABLE payment_splits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id         UUID REFERENCES payments(id) NOT NULL,
  booking_id         UUID REFERENCES bookings(id) NOT NULL,
  recipient_type     VARCHAR(20) NOT NULL,  -- 'driver', 'cashier', 'company'
  recipient_id       UUID,                  -- driver or cashier UUID (null for company)
  amount             DECIMAL(10,2) NOT NULL,
  percentage         DECIMAL(5,2) NOT NULL,
  payout_trigger     VARCHAR(20) NOT NULL,  -- 'on_payment' (cashier) or 'on_release' (driver/company)
  payout_status      VARCHAR(20) DEFAULT 'pending',
  -- cashier: pending → released
  -- driver:  pending → pending_review → released / flagged / rejected
  reviewed_by        UUID REFERENCES admins(id),  -- admin who released/flagged/rejected
  reviewed_at        TIMESTAMPTZ,
  review_note        TEXT,                  -- reason for flag/rejection
  stripe_transfer_id VARCHAR(255),          -- Stripe Connect transfer ID if auto-payout
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_splits_payment ON payment_splits(payment_id);
CREATE INDEX idx_splits_recipient ON payment_splits(recipient_type, recipient_id);
CREATE INDEX idx_splits_status ON payment_splits(payout_status);
```

### ratings

```sql
CREATE TABLE ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID REFERENCES bookings(id) UNIQUE NOT NULL,
  driver_id   UUID REFERENCES drivers(id) NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ratings_driver ON ratings(driver_id);
```

### settings

```sql
CREATE TABLE settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID REFERENCES admins(id)
);

-- Default settings
INSERT INTO settings (key, value, description) VALUES
  ('default_driver_pay_pct', '70', 'Default driver pay percentage'),
  ('default_cashier_commission_pct', '10', 'Default cashier commission percentage'),
  ('cashier_commission_enabled', 'true', 'Enable cashier commissions globally'),
  ('booking_window_days', '30', 'How many days ahead clients can book'),
  ('cancellation_window_hours', '2', 'Hours before ride for full refund'),
  ('late_cancel_refund_pct', '50', 'Refund % for late cancellations'),
  ('company_phone', '"5550000000"', 'Company contact phone'),
  ('company_name', '"RideFlow"', 'Company display name'),
  ('sms_enabled', 'true', 'Enable SMS notifications'),
  ('unassigned_alert_minutes', '15', 'Alert admin if run unassigned after X minutes'),
  ('driver_payout_schedule', '"weekly"', 'How often drivers are paid: weekly, biweekly, monthly');
```

### notification_log

```sql
CREATE TABLE notification_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient    VARCHAR(20) NOT NULL,  -- phone number or email
  channel      VARCHAR(10) NOT NULL,  -- sms, email, push
  message      TEXT NOT NULL,
  status       VARCHAR(20) DEFAULT 'sent',  -- sent, failed, delivered
  related_type VARCHAR(20),           -- booking, driver, cashier
  related_id   UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### geofence

```sql
CREATE TABLE geofence (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  polygon     JSONB NOT NULL,  -- array of {lat, lng} points
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Key Queries (for reference)

### Get available runs for a driver (vehicle-filtered)
```sql
-- $1 = driver's vehicle_type
SELECT b.* FROM bookings b
WHERE b.status = 'paid'
  AND b.driver_id IS NULL
  AND b.vehicle_type = $1
  AND b.pickup_date >= CURRENT_DATE
ORDER BY b.pickup_date, b.pickup_time;
```

### Driver earnings this month
```sql
SELECT SUM(ps.amount) as total_earnings, COUNT(*) as total_rides
FROM payment_splits ps
JOIN bookings b ON ps.booking_id = b.id
WHERE ps.recipient_type = 'driver'
  AND ps.recipient_id = $1
  AND b.completed_at >= date_trunc('month', NOW());
```

### Rides per hotel this month
```sql
SELECT h.name, COUNT(b.id) as rides, SUM(b.total_amount) as revenue
FROM bookings b
JOIN hotels h ON b.hotel_id = h.id
WHERE b.pickup_date >= date_trunc('month', CURRENT_DATE)
  AND b.status = 'completed'
GROUP BY h.id, h.name
ORDER BY rides DESC;
```

### Active upsale for current time
```sql
SELECT * FROM upsales
WHERE is_active = true
  AND start_time <= NOW()
  AND end_time >= NOW();
```
