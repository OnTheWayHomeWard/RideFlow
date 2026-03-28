# 07 — Notifications System

## Overview
SMS is the primary channel (clients don't have an app). Push notifications for drivers (PWA or future app). Email for admin.

---

## SMS Messages (via Twilio)

### To Client

| Trigger | Message |
|---------|---------|
| Booking confirmed | "Your ride is booked! #RF-0042. Marriott → Airport, Mar 24 at 10:30 AM. We'll text you when a driver is assigned. Questions? Call (555) 000-0000" |
| Driver assigned | "Driver assigned! Marcus will pick you up in a Toyota Highlander (plate ABC-1234). He'll be at Marriott at 10:30 AM." |
| Driver en route (optional) | "Your driver Marcus is on the way! ETA 10 minutes." |
| Ride completed | "Thanks for riding with RideFlow! Rate your experience: https://rideflow.com/rate/RF-0042" |
| Cancellation confirmed | "Your ride #RF-0042 has been cancelled. Refund of $60.00 will appear in 3-5 business days." |

### To Driver

| Trigger | Message |
|---------|---------|
| New run available | "New ride: Marriott → Airport, 10:30 AM. You earn $38.50. Accept at /driver" |
| Reminder (30 min before) | "Reminder: Pickup at Marriott in 30 min. Client: John (Room 412). 3 passengers." |
| Run cancelled | "Ride #RF-0042 has been cancelled by the client." |

### To Admin

| Trigger | Channel |
|---------|---------|
| New run booked | Email + in-app |
| Driver accepts | In-app |
| New driver registration | Email + in-app |
| New cashier registration | Email + in-app |
| Unassigned run >15 min | Email + SMS |
| Payment failure | Email |

---

## Implementation: Twilio

```javascript
// Send SMS via Twilio
const twilio = require('twilio');
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

async function sendSMS(to, message) {
  await client.messages.create({
    body: message,
    from: TWILIO_PHONE_NUMBER,
    to: to
  });
}
```

Cost estimate: ~$0.0079 per SMS in US. At 5 SMS per ride × 30 rides/day = ~$1.19/day.

---

## Real-time Notifications for Driver Portal

Use **WebSockets** (Socket.io or native WS) for real-time:
- New run appears instantly
- Run removed when another driver accepts
- Status updates

Fallback: polling every 10 seconds if WebSocket unavailable.
