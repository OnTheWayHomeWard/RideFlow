# 10 — Rating & Feedback

## Overview
After a ride completes, the client receives an SMS with a link to rate their experience. No login required — the link contains a unique token.

---

## Flow

```
Ride completed by driver
  ↓
System sends SMS to client:
  "Thanks for riding with RideFlow! Rate your experience:
   https://rideflow.com/rate/RF-0042?token=abc123xyz"
  ↓
Client taps link → Rating page opens
  ↓
Client sees: driver name, route, date
  ↓
Client taps 1-5 stars
  ↓
Optional: write a comment
  ↓
Optional: report a problem / contact us
  ↓
Submit → Thank you page
```

---

## Rating Page Design

```
┌─────────────────────────────────┐
│  🚐 RideFlow                   │
│                                 │
│  How was your ride?             │
│                                 │
│  Marriott → Airport             │
│  March 24, 2026 at 10:30 AM    │
│  Driver: Marcus J.              │
│                                 │
│  ┌────────────────────────────┐ │
│  │   ☆   ☆   ☆   ☆   ☆      │ │  ← tap to rate
│  │  1    2    3    4    5     │ │
│  └────────────────────────────┘ │
│                                 │
│  Comments (optional):           │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  │                            │ │
│  └────────────────────────────┘ │
│                                 │
│  [ Submit Rating ]              │
│                                 │
│  ─────────────────────────────  │
│  Had a problem?                 │
│  [ Contact Us ]                 │
└─────────────────────────────────┘
```

---

## Rating Rules

- Rating link is valid for 7 days after ride completion
- Each booking can only be rated once
- Rating token is unique and single-use (prevents tampering)
- Anonymous — only booking number is needed, no login

---

## Driver Rating Calculation

```
new_average = (current_avg * total_ratings + new_rating) / (total_ratings + 1)
```

Driver rating is visible to:
- Admin (in driver management)
- Driver (in their portal)
- NOT visible to clients before booking (to keep it simple)

---

## Contact Us / Complaints

If client taps "Contact Us":
```
┌─────────────────────────────────┐
│  Contact Us                     │
│                                 │
│  Phone: (555) 000-0000          │
│  Email: support@rideflow.com    │
│                                 │
│  Or describe your issue:        │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  └────────────────────────────┘ │
│  [ Send ]                       │
└─────────────────────────────────┘
```

Complaint submissions go to admin notification queue.
