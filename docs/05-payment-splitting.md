# 05 — Payment & Splitting

## Overview
Client pays upfront via Stripe. The cashier commission (if applicable) is paid out **immediately** after payment confirmation. When the driver marks a ride complete, a **payout request** is created for admin review. The driver only gets paid after admin **verifies and releases** the payment.

---

## Payment Flow

```
Client clicks "Pay $80"
  ↓
Stripe Checkout Session created
  ↓
Client pays on Stripe's hosted page (PCI compliant)
  ↓
Stripe webhook → backend confirms payment
  ↓
┌─────────────────────────────────────────────────┐
│  IMMEDIATE: Cashier payout triggered             │
│  (if booking has a cashier referral)             │
│  Cashier's 10% ($8.00) → sent to their account  │
└─────────────────────────────────────────────────┘
  ↓
Run created with status = PAID
Broadcast to eligible drivers
  ↓
... driver accepts, ride happens ...
  ↓
Driver taps "Complete Ride"
  ↓
┌─────────────────────────────────────────────────┐
│  PAYOUT REQUEST CREATED (not paid yet!)          │
│  Status: PENDING REVIEW                          │
│  Driver's cut: $37.80                            │
│  Admin gets notification: "Ride completed,       │
│  payout request awaiting verification"           │
└─────────────────────────────────────────────────┘
  ↓
Admin reviews the payout request:
  - Sees ride details (route, driver, client info)
  - Calls the client to confirm the ride happened
  - Checks GPS start/end locations recorded
  ↓
Admin clicks "Release Payment"
  ↓
┌─────────────────────────────────────────────────┐
│  RELEASED: Driver payout sent                    │
│  Driver's 70% ($37.80) → sent to their account  │
│  Company keeps remaining ($34.20)                │
└─────────────────────────────────────────────────┘
```

---

## Why This Timing?

| Recipient | When paid | Why |
|-----------|-----------|-----|
| **Cashier** | **Immediately** (on payment confirmation) | Cashier did their job the moment the client booked. No reason to wait. Instant payout builds trust with hotel partners. |
| **Driver** | **After admin releases** | Driver marks complete → payout request created → admin verifies ride actually happened → releases payment. Protects against fraud: fake completions, no-shows marked as done, inflated rides. |
| **Company** | **After admin releases** | Company portion is settled when admin releases the driver payout. |

---

## Payout Request System

### What happens when driver taps "Complete Ride"

1. Ride status changes to `completed`
2. GPS location recorded (dropoff)
3. A **payout request** is created with status `pending_review`
4. Admin gets a notification: "Payout request: Run #RF-0042 — $37.80 for Marcus"
5. Client gets thank-you SMS + rating link
6. Driver sees: "Ride completed. Payout pending verification."

### What admin sees

```
┌─────────────────────────────────────────────────┐
│  Payout Requests                    [3 pending] │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  🟡 PENDING REVIEW                        │  │
│  │                                           │  │
│  │  Run #RF-0042                             │  │
│  │  Marriott → Airport                       │  │
│  │  Today, 10:30 AM                          │  │
│  │                                           │  │
│  │  Driver: Marcus J. (Van)                  │  │
│  │  Client: John Smith — (555) 123-4567  📞 │  │  ← tap to call
│  │                                           │  │
│  │  GPS: Pickup ✓ (Marriott area)            │  │
│  │       Dropoff ✓ (Airport area)            │  │
│  │                                           │  │
│  │  Driver payout: $37.80                    │  │
│  │  Company keeps: $34.20                    │  │
│  │                                           │  │
│  │  [ Release Payment ]  [ Flag Issue ]      │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  🟡 PENDING REVIEW                        │  │
│  │  Run #RF-0043 ...                         │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Admin actions on a payout request

| Action | What happens |
|--------|-------------|
| **Release Payment** | Payout sent to driver. Status → `released`. Company portion settled. |
| **Flag Issue** | Payout held. Admin enters a note (e.g., "client says driver didn't show"). Status → `flagged`. Admin investigates further. |
| **Reject Payout** | Payout denied. Driver notified with reason. Status → `rejected`. Used for confirmed fraud. |

### What the driver sees

```
── Payout Status on each ride ──

Completed rides show one of:
  🟡 "Payout pending verification"    — waiting for admin
  🟢 "Payout released — $37.80"       — money on the way
  🔴 "Payout flagged — contact admin"  — issue raised
  ❌ "Payout rejected"                 — denied with reason
```

Drivers do NOT see the total fare, company cut, or any internal details — just their amount and the status.

---

## Stripe Integration

### Stripe Checkout (for client payment)
- Hosted payment page — zero PCI burden
- Supports cards, Apple Pay, Google Pay
- Built-in fraud protection
- Client redirected to Stripe → pays → redirected back

### Stripe Connect (for payouts)
- Company = **Platform account** (receives all payments)
- Drivers = **Connected accounts** (Express) — onboarded during registration
- Cashiers = **Connected accounts** (Express) — onboarded during approval

```
Platform account receives $80.00
  ↓ immediate
  Transfer $8.00 → Cashier's connected account
  ↓ after admin releases
  Transfer $37.80 → Driver's connected account
  ↓
  $34.20 remains in platform account (company revenue)
```

### Alternative: Manual Payouts (if not using Stripe Connect)
- Cashier: admin triggers immediate bank transfer / Zelle after each booking
- Driver: admin releases payout → triggers bank transfer / Zelle
- All amounts tracked in `payment_splits` table regardless of method

---

## Payment Split Logic

### Split Calculation

```javascript
function calculateSplit(totalAmount, booking) {
  let splits = {};

  // 1. Cashier commission — paid IMMEDIATELY
  if (booking.cashier_id) {
    const cashierPct = booking.cashier_commission_pct || 0.10;
    splits.cashier = {
      amount: totalAmount * cashierPct,
      payout_trigger: 'on_payment',  // immediate
    };
  }

  // 2. Driver cut — paid AFTER ADMIN RELEASES
  const driverBase = booking.upsale_driver_included
    ? totalAmount - (splits.cashier?.amount || 0)
    : booking.base_amount;

  const driverPct = booking.driver_pay_pct || 0.70;
  splits.driver = {
    amount: driverBase * driverPct,
    payout_trigger: 'on_release',  // after admin verifies and releases
  };

  // 3. Company gets the rest — settled AFTER ADMIN RELEASES
  splits.company = {
    amount: totalAmount - splits.driver.amount - (splits.cashier?.amount || 0),
    payout_trigger: 'on_release',
  };

  return splits;
}
```

### Example Splits

**Scenario 1: Regular ride, no cashier, no upsale**
```
Total: $60.00

ON PAYMENT:
  (no cashier — nothing happens)

DRIVER COMPLETES RIDE:
  Payout request created: $42.00 for driver (pending review)

ADMIN RELEASES:
  Driver (70%):  $42.00 → sent to driver
  Company (30%): $18.00 → stays in platform
```

**Scenario 2: Hotel cashier referral, no upsale**
```
Total: $60.00

ON PAYMENT (immediate):
  Cashier (10%): $6.00 → sent to cashier

DRIVER COMPLETES RIDE:
  Payout request created: $37.80 for driver (pending review)

ADMIN RELEASES:
  Driver (70% of $54 remaining): $37.80 → sent to driver
  Company: $16.20 → stays in platform
```

**Scenario 3: Upsale active, cashier, driver does NOT get upsale**
```
Total: $80.00 (base $60 + silent upsale $20)

ON PAYMENT (immediate):
  Cashier (10% of $80): $8.00 → sent to cashier

DRIVER COMPLETES RIDE:
  Payout request created: $42.00 for driver (pending review)

ADMIN RELEASES:
  Driver (70% of base $60): $42.00 → sent to driver
  Company: $30.00 → stays in platform (includes upsale profit)
```

**Scenario 4: Upsale active, cashier, driver DOES get upsale**
```
Total: $80.00 (base $60 + silent upsale $20)

ON PAYMENT (immediate):
  Cashier (10% of $80): $8.00 → sent to cashier

DRIVER COMPLETES RIDE:
  Payout request created: $50.40 for driver (pending review)

ADMIN RELEASES:
  Driver (70% of $72 remaining): $50.40 → sent to driver
  Company: $21.60 → stays in platform
```

---

## What Happens on Cancellation?

| Scenario | Cashier | Driver | Client |
|----------|---------|--------|--------|
| Client cancels >2 hours before | **Cashier keeps commission** (they did their job) | Nothing owed (not assigned yet or hasn't driven) | Full refund minus cashier commission |
| Client cancels <2 hours before | Cashier keeps commission | Nothing owed | 50% refund minus cashier commission |
| Client no-show | Cashier keeps commission | Driver submits payout request → admin decides (e.g., 50% for showing up) | No refund |
| Driver cancels/no-show | Cashier keeps commission | Nothing | Full refund |
| Ride complaint | Cashier keeps commission | Payout flagged → admin investigates | Admin discretion |

**Key principle:** Cashier commission is non-reversible once paid. They referred the client — that value was delivered regardless of what happens with the ride.

---

## Edge Cases

### Driver marks ride complete but client says it didn't happen
- Admin sees the payout request, calls client
- If client confirms ride didn't happen → admin rejects payout
- Driver gets notification: "Payout rejected — ride not confirmed by client"
- Admin can take further action (warning, suspension)

### Admin doesn't review payout for a long time
- System sends admin a reminder after 24 hours: "You have X payout requests pending"
- Drivers see "pending verification" — they know it's in the queue
- Consider: auto-release after 48 hours if no action taken (configurable, optional)

### Driver assigned but ride not yet happened — then client cancels
- No payout request exists yet (created only on complete), so nothing to reverse
- Cashier already paid — keeps their commission
- Client gets refund per cancellation policy

### Ride completed but payment initially failed
- This shouldn't happen because ride is only created after successful payment
- If Stripe webhook is delayed, booking stays in PENDING until confirmed

### Multiple upsales active at once
- Stack them: if two upsales apply (flat $10 + 15%), both are added to the price
- Split logic uses the final total regardless

---

## Payment Data Model

### payments table

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| booking_id | UUID | FK to bookings |
| stripe_payment_id | string | Stripe charge/payment intent ID |
| stripe_session_id | string | Stripe checkout session ID |
| amount | decimal | Total charged to client |
| currency | string | USD |
| status | enum | PENDING, CAPTURED, REFUNDED, PARTIALLY_REFUNDED, FAILED |
| refund_amount | decimal | If partially/fully refunded |
| refunded_at | timestamp | |
| created_at | timestamp | |

### payment_splits table

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| payment_id | UUID | FK to payments |
| booking_id | UUID | FK to bookings |
| recipient_type | enum | DRIVER, CASHIER, COMPANY |
| recipient_id | UUID | Driver or cashier UUID (null for company) |
| amount | decimal | Their cut |
| percentage | decimal | The % used to calculate |
| payout_trigger | enum | ON_PAYMENT (cashier), ON_RELEASE (driver/company) |
| payout_status | enum | PENDING, PENDING_REVIEW, RELEASED, FLAGGED, REJECTED |
| reviewed_by | UUID | Admin who released/flagged/rejected |
| reviewed_at | timestamp | When admin took action |
| review_note | string | Admin's note (reason for flag/rejection) |
| stripe_transfer_id | string | Stripe Connect transfer ID (if auto-payout) |
| paid_at | timestamp | When money actually transferred |
| created_at | timestamp | |

### Split lifecycle

```
CASHIER split:
  Created (PENDING) → Payment confirmed → Transfer sent (RELEASED)
  Timeline: seconds after client pays

DRIVER split:
  Created (PENDING) → Driver completes ride (PENDING_REVIEW) →
  Admin verifies → releases (RELEASED) → Transfer sent
  Timeline: hours/days after ride — depends on admin review speed

  OR: Admin flags (FLAGGED) → investigates → releases or rejects
  OR: Admin rejects (REJECTED) → driver notified, no payout

COMPANY split:
  Created (PENDING) → Admin releases driver payout (RELEASED)
  Timeline: same as driver — settled when admin releases
```

---

## Admin Notifications for Payout Requests

| Event | Channel | Message |
|-------|---------|---------|
| New payout request | In-app + Email | "Payout request: Run #RF-0042 completed. Marcus J. — $37.80. Verify and release." |
| Payout pending >24 hours | In-app + Email | "Reminder: 3 payout requests pending review for over 24 hours." |
| Driver disputes a rejection | In-app + Email | "Driver Marcus J. disputed rejected payout for Run #RF-0042." |
