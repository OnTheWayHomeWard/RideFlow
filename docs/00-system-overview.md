# RideFlow — Transport Booking System Overview

## Vision
A frictionless ride booking platform where clients book in **3 clicks** — no app download, no login. Think "Uber simplicity" but for a scheduled transport company with 50+ vehicles.

---

## Core Concept

```
CLIENT JOURNEY (3 clicks):
  1. Scan QR / Visit site → Pick destination (from popular routes or custom)
  2. Pick date/time + passengers + luggage + vehicle preference
  3. Pay (Stripe/Square) → Done. Get SMS confirmation.
```

```
SYSTEM FLOW:
  Client books → Payment captured → Run created →
  Drivers notified → First driver accepts →
  Client gets SMS confirmation with driver info →
  Driver picks up → marks "Started" → completes → marks "Completed" →
  Client gets thank-you SMS + rating link →
  Payment auto-splits (Driver % + Cashier % + Company %)
```

---

## System Components

| Component | Tech | Purpose |
|-----------|------|---------|
| **Client Booking Site** | React + Vite (mobile-first) | Public booking — no auth needed |
| **Driver Portal** | React (authenticated) | Accept runs, manage schedule, track earnings |
| **Admin Dashboard** | React (authenticated) | Manage drivers, cashiers, routes, pricing, reports |
| **API Backend** | Node.js / Express or Next.js API | Business logic, payment, notifications |
| **Database** | PostgreSQL | All data |
| **Payments** | Stripe Connect | Split payments to driver/cashier/company |
| **SMS/Notifications** | Twilio | Client confirmations, driver alerts, rating links |
| **Maps/Geo** | Google Maps API | Distance calc, geofencing, address autocomplete |

---

## User Roles

| Role | Auth Required? | How they enter |
|------|---------------|----------------|
| **Client** | No | Visit site or scan QR |
| **Cashier** (hotel front desk) | Yes | Self-register → admin approves, or admin adds |
| **Driver** | Yes | Self-register → admin approves, or admin adds |
| **Admin** | Yes | Pre-created accounts |

---

## Key Features Summary

1. **Zero-friction booking** — no signup, just fill & pay
2. **QR-based hotel integration** — scan cashier QR, hotel auto-populated
3. **Smart driver dispatch** — broadcast to eligible drivers, first-accept wins
4. **Auto payment splitting** — configurable % for driver, cashier, company
5. **Dynamic upsales** — time-based surcharges with configurable duration
6. **Geofenced service area** — restrict pickup/dropoff to served locations
7. **Common routes** — pre-defined popular routes for 1-click selection
8. **Distance-based pricing** — mileage × vehicle rate + extras
9. **Real-time driver tracking** — start/complete with location recording
10. **Post-ride rating** — SMS link to rate & review

---

## Documents Index

| # | Document | Description |
|---|----------|-------------|
| 01 | [Client Booking Flow](./01-client-booking-flow.md) | Step-by-step client UX |
| 02 | [Driver System](./02-driver-system.md) | Driver portal, dispatch, acceptance |
| 03 | [Cashier & Hotel System](./03-cashier-hotel-system.md) | Referral tracking, QR codes |
| 04 | [Pricing Engine](./04-pricing-engine.md) | Distance calc, vehicle rates, upsales |
| 05 | [Payment & Splitting](./05-payment-splitting.md) | Stripe integration, auto-splits |
| 06 | [Admin Dashboard](./06-admin-dashboard.md) | Management, reports, settings |
| 07 | [Notifications](./07-notifications.md) | SMS, push, alerts |
| 08 | [Database Design](./08-database-design.md) | Full schema |
| 09 | [Geofencing & Maps](./09-geofencing-maps.md) | Service area, distance calc |
| 10 | [Rating & Feedback](./10-rating-feedback.md) | Post-ride experience |
| 11 | [UI Wireframes](./11-ui-wireframes.md) | Screen descriptions |
| 12 | [Implementation Plan](./12-implementation-plan.md) | Phases, timeline, tech stack |
