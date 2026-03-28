# 02 — Driver System

## Overview
Drivers are the backbone. They need a simple, fast portal to accept rides, track their schedule, and record ride progress. Since our system is **reservation-based** (not real-time hailing), drivers can accept future runs days in advance and manage their own schedule — as long as nothing overlaps.

---

## Driver Registration Flow

Registration collects **everything upfront** — vehicle category, payment info for splits, documents. No back-and-forth later.

```
Driver visits → /driver/register
  ↓
Fills form (one page, sectioned):

  ── Personal Info ──
  • Full name
  • Phone number (used for login)
  • Email (optional)
  • Profile photo (upload)

  ── Vehicle Info ──
  • Vehicle category: [ Sedan | SUV | Van | Large Van ]  ← tap to select
  • Vehicle make & model (e.g., "Toyota Highlander 2022")
  • Vehicle color
  • License plate number
  • Vehicle photo (upload — used for client recognition)

  ── Driving Credentials ──
  • Driver's license number
  • License expiry date
  • License photo (upload — front & back)

  ── Payment Info (for earnings payout) ──
  • Payout method: [ Bank Account | Zelle | Stripe Connect ]
  • Bank name + routing/account number
  • OR Zelle phone/email
  • OR Stripe Connect onboarding (redirects to Stripe)

  ── Agreement ──
  • ☑ I agree to the terms of service
  • ☑ I have valid insurance for commercial transport

  [ Submit Registration ]
  ↓
Status = PENDING
  ↓
Admin gets notification: "New driver registration — Marcus J. (Van)"
  ↓
Admin reviews: sees all info, photos, license, vehicle
  ↓
Admin approves or rejects (with optional rejection reason)
  ↓
Driver gets SMS:
  Approved: "Welcome to RideFlow! Login at rideflow.com/driver"
  Rejected: "Registration not approved. Reason: [X]. Contact us."
```

**OR** Admin adds driver directly from Admin Dashboard (fills the same fields).

---

## Driver Portal Features

### Login
- Phone + password (set during registration)
- Optional future: SMS OTP login (no password to forget)

### Dashboard (after login)

Runs are **filtered by the driver's vehicle category automatically.** A Van driver only sees Van runs. A Sedan driver only sees Sedan runs. No clutter.

```
┌─────────────────────────────────────┐
│  Hi, Marcus 👋       [ 🟢 Online ] │  ← toggle online/offline
│  Van • Ford Transit • ABC-1234     │
│  Today's Earnings: $340             │
│                                     │
│  ── Available Runs (Van) ──         │  ← only Van runs shown
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🔔 NEW                     │    │
│  │  Today, 10:30 AM            │    │
│  │  Marriott → Airport         │    │
│  │  6 pax • 4 bags             │    │
│  │                              │    │
│  │  You earn: $45.50           │    │
│  │                              │    │
│  │  [ ACCEPT ]                  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🔔 NEW                     │    │
│  │  Tomorrow, 8:00 AM          │    │
│  │  Hilton → Convention Center │    │
│  │  8 pax • 6 bags             │    │
│  │                              │    │
│  │  You earn: $38.50           │    │
│  │                              │    │
│  │  [ ACCEPT ]                  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🔔 NEW                     │    │
│  │  Mar 27, 2:00 PM            │    │
│  │  Airport → Beach Resort     │    │
│  │  5 pax • 3 bags             │    │
│  │                              │    │
│  │  You earn: $52.50           │    │
│  │                              │    │
│  │  [ ACCEPT ]                  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── My Schedule ──                  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ✓ TODAY 2:00 PM            │    │
│  │  Airport → Resort           │    │
│  │  4 pax • $45.50             │    │
│  │                   [ START ] │    │
│  ├─────────────────────────────┤    │
│  │  ✓ TOMORROW 9:00 AM        │    │
│  │  Marriott → Downtown       │    │
│  │  7 pax • $38.50             │    │
│  ├─────────────────────────────┤    │
│  │  ✓ MAR 28  11:00 AM        │    │
│  │  Hilton → Airport           │    │
│  │  3 pax • $45.50             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌────────┐ ┌──────────┐ ┌──────┐  │
│  │📅 Sched│ │💰 Earning│ │📋 Hist│  │
│  └────────┘ └──────────┘ └──────┘  │
└─────────────────────────────────────┘
```

---

## Run Distribution Logic (Simple First-Accept)

### How it works:

```
New run created (payment confirmed)
  │
  ▼
System determines ELIGIBLE drivers:
  ├── Driver status = ACTIVE (admin approved)
  ├── Driver is_online = TRUE
  └── Driver vehicle_type = booking's requested vehicle type
  │
  ▼
Broadcast run to ALL eligible drivers simultaneously
  │
  ▼
First driver to tap "ACCEPT" gets the run
  │
  ▼
Run assigned to that driver, removed from all other drivers' lists
Client gets SMS: "Your driver Marcus is confirmed!"
```

**That's it.** If a driver accepts, the run is theirs. The driver is responsible for managing their own schedule — they can see all their accepted runs in the Schedule tab and decide what they can handle.

### What Drivers See

All unassigned runs matching their vehicle type:

```sql
SELECT b.* FROM bookings b
WHERE b.status = 'paid'
  AND b.driver_id IS NULL
  AND b.vehicle_type = $driver_vehicle_type
  AND b.pickup_date >= CURRENT_DATE
ORDER BY b.pickup_date, b.pickup_time;
```

### Why Simple First-Accept?

| Benefit | Why |
|---------|-----|
| **Fair** | All eligible drivers see every run equally |
| **Fast** | No waiting for admin to manually assign |
| **Self-regulating** | Drivers who want more runs stay online and respond fast |
| **No bottleneck** | Works 24/7 without admin intervention |
| **Driver autonomy** | Drivers manage their own schedule — they know their availability better than any algorithm |

---

## Ride Lifecycle (Driver Actions)

```
ASSIGNED → EN_ROUTE → STARTED → COMPLETED

Driver taps "Accept"
  → Status: ASSIGNED
  → Added to driver's schedule
  → Client gets SMS with driver name, vehicle, plate, color, photo

(When it's time for the ride)

Driver taps "On My Way"  (optional, nice-to-have)
  → Status: EN_ROUTE
  → Client gets SMS: "Your driver is on the way"

Driver arrives at pickup, taps "Start Ride"
  → Status: IN_PROGRESS
  → GPS location recorded (actual pickup location)
  → Timestamp recorded

Driver arrives at destination, taps "Complete Ride"
  → Status: COMPLETED
  → GPS location recorded (actual dropoff location)
  → Timestamp recorded
  → Payment split triggered
  → Client gets thank-you SMS + rating link
```

### Driver Active Ride Screen

```
┌─────────────────────────────────────┐
│  ← Back to Schedule                │
│                                     │
│  ACTIVE RIDE                        │
│  ┌─────────────────────────────┐    │
│  │  Marriott → Airport         │    │
│  │  Client: John Smith          │    │
│  │  Phone: (555) 123-4567  📞  │    │  ← tap to call client
│  │  Room: 412                   │    │
│  │  6 passengers, 4 bags       │    │
│  │  Note: Pick up from lobby   │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │    [ 🟢 START RIDE ]        │    │  ← records GPS + time
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── after ride started ──           │
│                                     │
│  ⏱ Ride in progress... 12 min      │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │    [ ✓ COMPLETE RIDE ]      │    │  ← records GPS + time
│  │                             │    │  ← triggers payment split
│  └─────────────────────────────┘    │
│                                     │
│  Need help? Call dispatch           │
│  (555) 000-0000                     │
└─────────────────────────────────────┘
```

---

## Driver Schedule View

A calendar-style view of all accepted upcoming runs:

```
┌─────────────────────────────────────┐
│  📅 My Schedule                     │
│                                     │
│  ── Today, Mar 24 ──                │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  10:30 AM                   │    │
│  │  Marriott → Airport         │    │
│  │  6 pax • You earned $45.50 │    │
│  │  Status: ✓ Completed        │    │
│  ├─────────────────────────────┤    │
│  │  2:00 PM                    │    │
│  │  Airport → Resort           │    │
│  │  4 pax • You earn $45.50   │    │
│  │  Status: Upcoming           │    │
│  │                    [ START ] │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── Tomorrow, Mar 25 ──            │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  9:00 AM                    │    │
│  │  Marriott → Downtown        │    │
│  │  7 pax • You earn $38.50   │    │
│  ├─────────────────────────────┤    │
│  │  1:00 PM                    │    │
│  │  Beach → Airport            │    │
│  │  3 pax • You earn $45.50   │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── Mar 28 ──                       │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  11:00 AM                   │    │
│  │  Hilton → Airport            │    │
│  │  3 pax • You earn $45.50   │    │
│  └─────────────────────────────┘    │
│                                     │
│  No more scheduled rides.           │
│  Check available runs to pick up    │
│  more!                              │
└─────────────────────────────────────┘
```

---

## Driver Earnings View

```
┌─────────────────────────────────────┐
│  💰 My Earnings                     │
│                                     │
│  ┌──────────┐┌──────────┐┌────────┐ │
│  │  Today   ││This Week ││ Month  │ │
│  │  $340    ││ $1,890   ││$7,200  │ │
│  │  8 rides ││ 42 rides ││182 rds │ │
│  └──────────┘└──────────┘└────────┘ │
│                                     │
│  ── Payout Info ──                  │
│  Method: Bank Account (****4521)    │
│  Next payout: Friday, Mar 28       │
│  Pending: $540.00                   │
│                                     │
│  ── Today's Rides ──                │
│  10:30 AM  Marriott→Airport   $45  │
│  11:15 AM  Hilton→Downtown    $38  │
│  12:00 PM  Airport→Resort     $52  │
│  ...                                │
│                                     │
│  [ View Full History ]              │
└─────────────────────────────────────┘
```

---

## Ride History

Drivers can see all past rides with:
- Date/time
- Route (from → to)
- Client name
- **Their earnings only** (just the dollar amount they earned — no total fare, no percentage, no company/cashier info)
- Rating received (if any)
- Status (completed, cancelled, no-show)
- Filter by date range, month

---

## Driver Data Model

| Field | Type | Notes |
|-------|------|-------|
| **id** | UUID | Primary key |
| | | |
| **── Personal ──** | | |
| name | string | Full name |
| phone | string | Unique, used for login + SMS |
| email | string | Optional |
| password_hash | string | Hashed |
| photo_url | string | Profile photo |
| | | |
| **── Vehicle ──** | | |
| vehicle_type | enum | SEDAN, SUV, VAN, LARGE_VAN |
| vehicle_make | string | e.g., "Ford Transit 2023" |
| vehicle_plate | string | License plate |
| vehicle_color | string | For client identification |
| vehicle_photo_url | string | Photo of actual vehicle |
| | | |
| **── Credentials ──** | | |
| license_number | string | Driving license |
| license_expiry | date | For admin review |
| license_photo_url | string | Front & back |
| has_insurance | boolean | Commercial transport insurance |
| | | |
| **── Payment / Payout ──** | | |
| pay_percentage | decimal | Default 70%, configurable per driver |
| payout_method | enum | BANK, ZELLE, STRIPE_CONNECT |
| payout_details | jsonb | Encrypted: {bank_name, routing, account} or {zelle_email} |
| stripe_connect_id | string | If using Stripe Connect for auto-payouts |
| | | |
| **── Status ──** | | |
| status | enum | PENDING, ACTIVE, INACTIVE, SUSPENDED |
| is_online | boolean | Currently accepting runs |
| rejection_reason | string | If admin rejected registration |
| | | |
| **── Stats ──** | | |
| rating_avg | decimal | Running average (1.0–5.0) |
| total_rides | integer | Lifetime counter |
| total_earnings | decimal | Lifetime earnings |
| | | |
| **── Timestamps ──** | | |
| created_at | timestamp | Registration date |
| approved_at | timestamp | When admin approved |
| approved_by | UUID | Admin who approved |
| last_online_at | timestamp | Last time driver was active |

---

## Registration Form Design

```
┌─────────────────────────────────────┐
│  Join RideFlow as a Driver          │
│                                     │
│  ── About You ──                    │
│                                     │
│  Full Name:                         │
│  [...............................]   │
│                                     │
│  Phone:                             │
│  [...............................]   │
│                                     │
│  Email (optional):                  │
│  [...............................]   │
│                                     │
│  Password:                          │
│  [...............................]   │
│                                     │
│  Profile Photo:                     │
│  [ 📷 Upload Photo ]               │
│                                     │
│  ── Your Vehicle ──                 │
│                                     │
│  Category:                          │
│  ┌────────┐┌────────┐              │
│  │ Sedan  ││  SUV   │              │
│  └────────┘└────────┘              │
│  ┌────────┐┌────────────┐          │
│  │  Van   ││ Large Van  │          │
│  └────────┘└────────────┘          │
│                                     │
│  Make & Model:                      │
│  [...............................]   │
│                                     │
│  Color:              Plate:         │
│  [.............]   [............]   │
│                                     │
│  Vehicle Photo:                     │
│  [ 📷 Upload Photo ]               │
│                                     │
│  ── License ──                      │
│                                     │
│  License Number:                    │
│  [...............................]   │
│                                     │
│  Expiry Date:                       │
│  [ 📅 .........................]   │
│                                     │
│  License Photo (front & back):      │
│  [ 📷 Upload Front ] [ 📷 Back ]   │
│                                     │
│  ── Payout Method ──                │
│                                     │
│  How do you want to get paid?       │
│  ┌────────────────┐┌─────────────┐  │
│  │ Bank Account   ││   Zelle     │  │
│  └────────────────┘└─────────────┘  │
│                                     │
│  (if Bank selected:)                │
│  Bank Name:   [...................] │
│  Routing #:   [...................] │
│  Account #:   [...................] │
│                                     │
│  (if Zelle selected:)               │
│  Zelle Phone or Email:              │
│  [...............................]   │
│                                     │
│  ── Agreement ──                    │
│                                     │
│  ☐ I have valid commercial          │
│    transport insurance              │
│  ☐ I agree to the Terms of Service  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      Submit Registration    │    │
│  └─────────────────────────────┘    │
│                                     │
│  We'll review your application      │
│  and text you within 24 hours.      │
└─────────────────────────────────────┘
```

---

## Driver Notifications

| Event | Channel | Message |
|-------|---------|---------|
| New run available (matches vehicle + no conflict) | Push + SMS | "New ride: Marriott → Airport, Mar 24 at 10:30 AM. You earn $45.50. Accept at /driver" |
| Run accepted by another driver | Push | Run silently removed from available list (real-time via WebSocket) |
| Reminder: upcoming ride in 30 min | Push + SMS | "Reminder: Pickup at Marriott in 30 min. Client: John (Room 412). 6 passengers." |
| Reminder: upcoming ride in 2 hours | Push | "You have a ride in 2 hours: Airport → Resort at 2:00 PM" |
| Client cancelled | Push + SMS | "Ride #RF-0042 has been cancelled. Removed from your schedule." |
| Payout sent | Push + SMS | "Payout of $540.00 sent to your bank account (****4521)" |
| Registration approved | SMS | "Welcome to RideFlow! Login at rideflow.com/driver with your phone number." |
| Registration rejected | SMS | "Registration update: [reason]. Contact us at (555) 000-0000." |

---

## Driver Self-Management

| Action | How |
|--------|-----|
| Go offline (stop seeing runs) | Toggle "Online/Offline" switch on dashboard |
| Cancel an accepted run | Tap run → "Cancel this run" (with confirmation). Run goes back to available pool. Admin notified. Too many cancels → warning. |
| Update vehicle info | Profile → Edit Vehicle (admin re-approval NOT required for minor changes like color) |
| Update payout info | Profile → Payment Settings |
| Change password | Profile → Security |
| View/download tax summary | Earnings → Annual Summary (for 1099 / tax purposes) |
