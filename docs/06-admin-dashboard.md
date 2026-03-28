# 06 — Admin Dashboard

## Overview
The admin dashboard is the control center for managing drivers, cashiers, routes, pricing, and viewing business analytics.

---

## Admin Portal Sections

### 1. Dashboard (Home)

```
┌──────────────────────────────────────────────┐
│  📊 RideFlow Admin Dashboard                 │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ Today    │ │ This Week│ │This Month│     │
│  │ 34 rides │ │ 218 rides│ │ 892 rides│     │
│  │ $2,040   │ │ $13,080  │ │ $53,520  │     │
│  └──────────┘ └──────────┘ └──────────┘     │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ Company  │ │ Drivers  │ │ Cashiers │     │
│  │ Revenue  │ │ Paid     │ │ Paid     │     │
│  │ $612     │ │ $1,428   │ │ $204     │     │
│  └──────────┘ └──────────┘ └──────────┘     │
│                                              │
│  ── Recent Activity ──                       │
│  🔔 New driver registration: John D.         │
│  ✓ Run #RF-0042 completed by Marcus          │
│  🔔 New cashier registration: Sarah (Hilton) │
│  💰 Payment received: $65.00                 │
│                                              │
│  ── Active Runs ──                           │
│  2 in progress | 5 upcoming | 1 unassigned   │
└──────────────────────────────────────────────┘
```

---

### 2. Runs Management

View all runs with filters:
- Status: All / Pending / Accepted / In Progress / Completed / Cancelled
- Date range
- Driver
- Hotel / Cashier
- Vehicle type

Table columns:
| Booking # | Date/Time | From → To | Client | Driver | Vehicle | Amount | Status |

Actions:
- View details
- Cancel run (with refund option)
- Reassign driver (if needed)
- Add notes

---

### 3. Driver Management

| Name | Phone | Vehicle | Status | Rating | Rides | Earnings | Actions |
|------|-------|---------|--------|--------|-------|----------|---------|
| Marcus J. | 555-1234 | SUV - Toyota | Active 🟢 | 4.8 | 342 | $12,400 | Edit / Deactivate |
| Anna K. | 555-5678 | Sedan - Honda | Active 🟢 | 4.9 | 215 | $8,200 | Edit / Deactivate |
| Tom L. | 555-9012 | Van - Ford | Pending ⏳ | - | 0 | $0 | Approve / Reject |

Actions:
- **Add Driver** — manual creation
- **Approve/Reject** — for self-registered drivers
- **Edit** — change vehicle, pay %, contact info
- **Deactivate/Reactivate** — soft disable
- **View History** — all rides for this driver

---

### 4. Cashier Management

| Name | Hotel | Phone | Status | Referrals | Earnings | Actions |
|------|-------|-------|--------|-----------|----------|---------|
| Sarah M. | Marriott | 555-1111 | Active | 47 | $282 | Edit / QR |
| James R. | Hilton | 555-2222 | Pending | 0 | $0 | Approve |

Actions:
- **Add Cashier** — link to hotel
- **Approve/Reject**
- **Generate QR Code** — download/print
- **Edit Commission %**
- **Deactivate**

---

### 5. Hotel Management

| Hotel | Address | Cashiers | Total Rides | This Month | Commission Rate |
|-------|---------|----------|-------------|------------|-----------------|
| Marriott | 123 Main St | 3 | 420 | 47 | 10% |
| Hilton | 456 Ocean Ave | 2 | 310 | 38 | 12% |

Actions:
- Add / Edit / Deactivate hotels
- Set default commission rate per hotel
- View all rides from this hotel

---

### 6. Pricing & Routes

**Vehicle Rates:**
Edit base fares, per-mile rates for each vehicle type.

**Common Routes:**
Add/edit/remove pre-defined routes with fixed prices.

**Extras:**
Manage add-on services and their prices.

**Upsales:**
- Create time-limited price surcharges
- Set start/end time
- Choose flat or percentage
- Toggle whether driver receives upsale amount

---

### 7. Reports & Analytics

#### Available Reports:

**Rides Report**
- Rides per day/week/month (chart)
- Rides by vehicle type
- Rides by status (completed, cancelled, no-show)
- Average ride value
- Peak hours heatmap

**Revenue Report**
- Total revenue per period
- Company revenue (after splits)
- Revenue by hotel source
- Revenue trend chart

**Driver Report**
- Rides per driver
- Earnings per driver
- Average rating per driver
- Response time (how fast they accept runs)

**Cashier/Hotel Report**
- Rides per cashier
- Rides per hotel
- Commission paid per cashier/hotel
- Top-performing hotels

**Client Report**
- Repeat clients
- Average rating given
- Most popular routes
- Most popular vehicle types

---

### 8. Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Default driver pay % | 70% | Can override per driver |
| Default cashier commission % | 10% | Can override per hotel/cashier |
| Cashier commission enabled | Yes | Global toggle |
| Booking window (days ahead) | 30 | How far ahead clients can book |
| Cancellation window (hours) | 2 | Full refund if cancelled before |
| Late cancellation refund % | 50% | Refund if cancelled too late |
| SMS notifications enabled | Yes | Global toggle |
| Service area geofence | [coordinates] | Allowed pickup/dropoff area |
| Company phone number | - | Shown on booking confirmation |
| Company name | - | Branding |

---

## Admin Notifications

| Event | Notification |
|-------|-------------|
| New run booked | "New ride booked: Marriott → Airport, $60" |
| Driver accepts run | "Marcus accepted run #RF-0042" |
| Run completed | "Run #RF-0042 completed" |
| New driver registration | "New driver registration: John D. — Review now" |
| New cashier registration | "New cashier registration: Sarah (Hilton) — Review now" |
| Payment failed | "Payment failed for booking #RF-0043" |
| Client complaint | "New complaint for run #RF-0040" |
| Unassigned run (>15 min) | "Alert: Run #RF-0044 has no driver for 15 minutes" |

Notification channels: In-app + Email (optionally SMS for urgent alerts)
