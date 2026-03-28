# 04 — Pricing Engine

## Overview
Pricing is calculated based on distance, vehicle type, and extras. Upsales are applied silently — the client just sees a final price with no "surge" or "peak pricing" label. From the client's perspective, that's simply the price.

---

## Price Calculation Formula

```
total_price = base_fare
            + (distance_miles × per_mile_rate[vehicle_type])
            + extras
            + upsale_amount (if active)
```

---

## Base Rates (configurable by admin)

| Vehicle Type | Base Fare | Per Mile Rate | Max Passengers |
|-------------|-----------|---------------|----------------|
| Sedan | $15.00 | $2.50/mi | 3 |
| SUV | $20.00 | $3.00/mi | 5 |
| Van | $25.00 | $3.50/mi | 8 |
| Large Van | $35.00 | $4.00/mi | 14 |

### Extras (add-ons)

| Extra | Price | Notes |
|-------|-------|-------|
| Room pickup | $5.00 | Driver goes to room/lobby |
| Extra luggage (3+) | $10.00 | More than 2 bags |
| Child seat | $5.00 | If available |
| Wait time (per 15 min) | $10.00 | If driver has to wait |

---

## Common Routes (Pre-defined Pricing)

Admin can create common routes with **fixed prices** that override the distance calculation:

| Route | Sedan | SUV | Van |
|-------|-------|-----|-----|
| Airport → Downtown | $35 | $45 | $55 |
| Hotel District → Airport | $45 | $55 | $65 |
| Airport → Beach Resort | $50 | $60 | $75 |
| Downtown → Convention Center | $20 | $25 | $35 |

**Why fixed prices for common routes?**
- Clients see the price instantly (no calculation needed)
- Eliminates traffic/route variation complaints
- Simpler to market and display
- Admin controls profitability per route

---

## Upsale System

### What is an upsale?
A **silent** price increase applied by admin for a configurable time window. The client never sees a "surge" label, "peak pricing" badge, or any mention of an upsale. They just see the total price on the car selection screen — that's the price, period.

### Why invisible to the client?
- No negative perception ("why am I paying more?")
- No incentive to wait for the upsale to end
- Cleaner UX — the price is just the price
- The upsale is a **business decision**, not a client-facing feature

### Upsale Configuration (Admin only)

```
Admin creates upsale:
  - Name: "New Year's Eve" (internal label, never shown to clients)
  - Amount: +$20 flat  OR  +25% multiplier
  - Start: 2026-12-31 18:00
  - End: 2027-01-01 06:00
  - Applies to: ALL vehicle types (or specific ones)
  - Driver pay includes upsale: YES / NO  ← important toggle!
  - Cashier pay includes upsale: YES / NO
```

### Where upsale is visible

| Who | Sees upsale? | What they see |
|-----|-------------|---------------|
| **Client** | **NO** | Just the final price ($80). No breakdown, no label, no "surge" |
| **Driver** | Depends | Sees their cut. If `driver_gets_upsale = true`, their cut is higher. They don't need to know why |
| **Admin** | **YES** | Full visibility: upsale name, amount, which bookings it applied to, revenue impact in reports |

### Upsale & Pay Split Setting

Per upsale, admin chooses:
| Setting | Effect |
|---------|--------|
| `driver_gets_upsale = true` | Driver's % is calculated on total (base + upsale) |
| `driver_gets_upsale = false` (default) | Driver's % is calculated on base only; upsale goes to company |
| `cashier_gets_upsale = true` (default) | Cashier's % is calculated on total (base + upsale) |
| `cashier_gets_upsale = false` | Cashier's % is calculated on base only |

**Example with $60 base fare + $20 upsale = $80 total:**

| Setting | Driver (70%) | Company |
|---------|-------------|---------|
| Driver gets upsale | $56.00 (70% of $80) | $24.00 |
| Driver doesn't get upsale | $42.00 (70% of $60) | $38.00 |

### Upsale in Admin Reports

Admin dashboard shows:
- Which upsales are currently active
- Revenue from upsales this period
- How many bookings had upsale applied
- Upsale revenue vs base revenue (so admin knows the impact)

---

## Distance Calculation

### Method: Google Maps Distance Matrix API

```
Input: pickup_address, dropoff_address
Output: distance_miles, estimated_duration
```

- Use driving distance (not straight line)
- Cache common route distances to reduce API calls
- Round up to nearest 0.1 mile

### Geofence Check
Before calculating price, verify both pickup and dropoff are within the service area geofence. If outside, show: "Sorry, we don't serve this area yet."

---

## Price Display to Client

The client sees the final price on the car card (Screen 2) and a simple breakdown at checkout (Screen 3). **Upsale is baked into the vehicle price — never shown as a separate line.**

### On car selection (Screen 2):
The car card just shows the total price. If the base would be $55 and there's a $20 upsale active, the card shows **$75**. That's it.

### On checkout (Screen 3):
A clean summary, no upsale line:

```
┌─────────────────────────────┐
│  SUV — 12 mi         $75.00 │  ← upsale is already included
│  Room pickup          $5.00 │
│  ────────────────────────── │
│  Total               $80.00 │
└─────────────────────────────┘
```

### Behind the scenes (stored in DB):

```
base_amount:   $55.00   (distance calc or fixed route price)
upsale_amount: $20.00   (from active upsale — never shown to client)
extras_amount:  $5.00   (room pickup)
total_amount:  $80.00   (what client pays)
```

Admin can always see the breakdown in reports to understand what's base vs upsale revenue.

---

## Pricing Data Model

### vehicle_rates table

| Field | Type |
|-------|------|
| id | UUID |
| vehicle_type | enum |
| base_fare | decimal |
| per_mile_rate | decimal |
| max_passengers | integer |
| is_active | boolean |

### extras table

| Field | Type |
|-------|------|
| id | UUID |
| name | string |
| price | decimal |
| description | string |
| is_active | boolean |

### common_routes table

| Field | Type |
|-------|------|
| id | UUID |
| name | string |
| from_location | string |
| from_lat | decimal |
| from_lng | decimal |
| to_location | string |
| to_lat | decimal |
| to_lng | decimal |
| prices | jsonb |
| is_active | boolean |

### upsales table

| Field | Type |
|-------|------|
| id | UUID |
| name | string |
| type | enum (FLAT, PERCENTAGE) |
| amount | decimal |
| start_time | timestamp |
| end_time | timestamp |
| vehicle_types | array |
| driver_gets_upsale | boolean |
| is_active | boolean |
| created_by | UUID |
