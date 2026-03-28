# 01 — Client Booking Flow (Yango-Style)

## Design Philosophy
- **No login. No app download. No account creation.**
- Works on any phone browser
- **Destination-first** — just like Yango/Uber: "Where to?" is the only question
- Pickup is assumed (hotel from QR scan, or entered later)
- Cars shown visually with images and prices — tap to choose
- Confirm everything (time, pickup, details) at the summary step
- **2–3 taps to book**

---

## Entry Points

### Entry A: Direct Visit / Google Search
Client goes to `rideflow.com`. Lands on destination screen. No pickup assumed — they'll enter it at the summary step.

### Entry B: Hotel QR Code Scan (primary flow)
Client scans a QR code at hotel front desk. URL contains cashier ID:
```
https://rideflow.com/book?ref=CASHIER_ABC123
```
- Cashier auto-linked to this booking
- Hotel address becomes the default pickup (confirmed later at summary)
- Popular destinations from this hotel shown first

---

## Screen-by-Screen Flow

```
┌────────────┐     ┌────────────────┐     ┌────────────────┐     ┌──────────────┐
│  Where to? │────>│  Choose your   │────>│   Confirm &    │────>│  Booked!     │
│ (Screen 1) │     │  ride (cars)   │     │   Pay          │     │ (Screen 4)   │
│            │     │  (Screen 2)    │     │  (Screen 3)    │     │              │
└────────────┘     └────────────────┘     └────────────────┘     └──────────────┘
```

---

### Screen 1: "Where to?"

The opening screen adapts based on how the client arrived. Both versions keep it simple — set the route, move on.

#### Version A: Client scanned a hotel QR code

Pickup is already known (the hotel). Only ask for destination.

```
┌─────────────────────────────────────┐
│                                     │
│  ┌─────────────────────────────┐    │
│  │  RIDEFLOW                   │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  📍 Pickup: Marriott Hotel  │    │  ← from QR, shown as context
│  │     123 Main Street         │    │     (tap to change if needed)
│  └─────────────────────────────┘    │
│                                     │
│  Where are you going?               │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🔍  Search destination...  │    │  ← Google Places autocomplete
│  └─────────────────────────────┘    │
│                                     │
│  Popular Destinations               │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ✈   Airport                │    │
│  │      Denver International   │    │
│  ├─────────────────────────────┤    │
│  │  🏙   Downtown              │    │
│  │      City Center            │    │
│  ├─────────────────────────────┤    │
│  │  🏖   Beach / Resort Area   │    │
│  │      Oceanfront Drive       │    │
│  ├─────────────────────────────┤    │
│  │  🛍   Shopping Mall         │    │
│  │      Westfield Plaza        │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

#### Version B: Client visited the site directly (no QR)

No pickup known. Show **both fields** — pickup and destination. Try browser geolocation to pre-fill pickup as "Your current location", but let them type a different address.

```
┌─────────────────────────────────────┐
│                                     │
│  ┌─────────────────────────────┐    │
│  │  RIDEFLOW                   │    │
│  └─────────────────────────────┘    │
│                                     │
│  Book a ride                        │
│                                     │
│  Pickup from:                       │
│  ┌─────────────────────────────┐    │
│  │  📍  Your location          │    │  ← auto-detected via browser
│  │      (or type an address)   │    │     geolocation, editable
│  └─────────────────────────────┘    │
│                                     │
│  Going to:                          │
│  ┌─────────────────────────────┐    │
│  │  🔍  Search destination...  │    │  ← Google Places autocomplete
│  └─────────────────────────────┘    │
│                                     │
│  Popular Routes                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ✈   Airport                │    │
│  │      Denver International   │    │
│  ├─────────────────────────────┤    │
│  │  🏙   Downtown              │    │
│  │      City Center            │    │
│  ├─────────────────────────────┤    │
│  │  🏖   Beach / Resort Area   │    │
│  │      Oceanfront Drive       │    │
│  ├─────────────────────────────┤    │
│  │  🛍   Shopping Mall         │    │
│  │      Westfield Plaza        │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

#### What if geolocation fails or is denied?

```
┌─────────────────────────────────────┐
│  Pickup from:                       │
│  ┌─────────────────────────────┐    │
│  │  🔍  Type pickup address... │    │  ← empty, required
│  └─────────────────────────────┘    │
│                                     │
│  Going to:                          │
│  ┌─────────────────────────────┐    │
│  │  🔍  Search destination...  │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

Both fields use Google Places Autocomplete. Both are required before moving to Screen 2.

**Key UX decisions:**
- **QR users**: pickup shown as a confirmed context bar at the top (editable if they tap it), only destination input needed — keeps it to 1 field
- **Direct visitors**: both fields shown upfront so the route is fully set before car selection. No confusion later
- **Geolocation**: request browser location on page load. If granted, pre-fill pickup as "Your location" with the resolved address. If denied, field is empty and they type it
- Popular destinations are big, tappable list items (1 tap fills the destination)
- If QR scanned: popular destinations are **sorted by relevance to that hotel** (e.g., Airport is #1 for airport-area hotels)
- Both fields use Google Places Autocomplete with geofence bias
- **Geofence check**: if either address is outside service area, show inline: "We don't serve this area yet"
- Tapping a popular destination fills the "Going to" field → if pickup is also set → auto-advance to Screen 2
- **The route is fully locked by the time they leave Screen 1** — no surprises on later screens

---

### Screen 2: "Choose Your Ride"

This is the **hero screen** — like Yango. Show the cars visually with real photos, capacity info, and the calculated price for this route.

```
┌─────────────────────────────────────┐
│  ← Back                            │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  📍 Marriott → ✈ Airport    │    │  ← route summary bar
│  │     18 mi • ~25 min         │    │
│  └─────────────────────────────┘    │
│                                     │
│  Choose your ride                   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   [  🚗 sedan photo   ]    │    │  ← actual car image
│  │                             │    │
│  │   Sedan                     │    │
│  │   Up to 3 passengers        │    │
│  │   2 bags                    │    │
│  │                      $45    │    │  ← price for THIS route
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   [  🚙 SUV photo    ]     │    │  ← actual car image
│  │                             │    │
│  │   SUV                       │    │
│  │   Up to 5 passengers        │    │
│  │   3 bags                    │    │
│  │                      $55    │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   [  🚐 van photo    ]     │    │  ← actual car image
│  │                             │    │
│  │   Van                       │    │
│  │   Up to 8 passengers        │    │
│  │   5 bags                    │    │
│  │                      $65    │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   [ 🚌 large van photo ]   │    │  ← actual car image
│  │                             │    │
│  │   Large Van                 │    │
│  │   Up to 14 passengers       │    │
│  │   8+ bags                   │    │
│  │                      $85    │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

**When you tap a car card → goes directly to Screen 3 (Confirm & Pay).**

**Key UX decisions:**
- **Car images are the centerpiece** — real photos of the actual vehicle types you operate (not icons). Professional photos on a clean background, Yango-style
- Each card shows: image, name, capacity (passengers + bags), and **the exact price for this route**
- Prices are **pre-calculated** for this specific route before showing the screen
- For common/fixed routes: use the fixed price from the database
- For custom routes: calculate using distance × per-mile rate + base fare
- If an upsale is active, it's silently baked into the price — no badge, no label, the client just sees the final price
- **One tap selects the car AND moves to confirmation** — no separate "Next" button
- Cards are vertically scrollable — most important/popular vehicle on top
- If the client came via QR, the route summary bar shows the hotel name

**Visual design notes:**
- Car images should be ~160px tall, full-width within the card
- Price is bold, right-aligned, large font (24px+)
- Subtle shadow on cards, rounded corners (12px)
- Selected state: blue border highlight (if you want a select-then-continue pattern instead)

---

### Alternative: Select-then-Continue Pattern

If you prefer a pattern where the user selects a car and THEN taps "Continue" (gives them time to compare):

```
┌─────────────────────────────────────┐
│  ← Back                            │
│                                     │
│  📍 Marriott → ✈ Airport           │
│  18 mi • ~25 min                    │
│                                     │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │ [sedan img]                  │   │  ← horizontal scroll
│  │ Sedan • 3 pax         $45   │   │     car cards
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│      ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│      │ [SUV img]   ● SELECTED  │   │  ← blue border = selected
│      │ SUV • 5 pax       $55   │   │
│      └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│          ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│          │ [Van img]           │   │
│          │ Van • 8 pax   $65   │   │
│          └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │    Continue — SUV  $55      │    │  ← sticky bottom button
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

This **horizontal scroll** pattern (like Uber/Yango) keeps all options visible at once and uses a sticky bottom button. Either pattern works — the horizontal scroll is more compact.

---

### Screen 3: "Confirm & Pay"

Route and vehicle are already set. This screen handles: when, how many people, contact info, and payment. Pickup/destination are shown as a summary (already locked on Screen 1) — tappable to go back and change if needed.

```
┌─────────────────────────────────────┐
│  ← Back                            │
│                                     │
│  Confirm your ride                  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [SUV image small]  SUV    │    │
│  │  Marriott → Airport        │    │  ← tap to go back & change
│  └─────────────────────────────┘    │
│                                     │
│  ── When ──                         │
│                                     │
│  ┌────────────┐ ┌──────────────┐    │
│  │ 📅 Today   │ │ 🕐 10:30 AM │    │  ← defaults to today +
│  └────────────┘ └──────────────┘    │     next 30-min slot
│                                     │
│  ── Passengers & Luggage ──         │
│                                     │
│  Passengers:                        │
│  [ 1 ]  [ 2 ]  [●3 ]  [ 4 ] [ 5 ] │  ← tap chips
│                                     │
│  Luggage:                           │
│  [ None ] [● 1-2 ] [ 3+ ]          │  ← tap chips
│                                     │
│  ── Add-ons ──                      │
│                                     │
│  ☐  Pick me up from my room  +$5   │
│  ☐  Child seat               +$5   │
│                                     │
│  ── Your Info ──                    │
│                                     │
│  Name:  [........................]   │
│  Phone: [........................]   │
│  Room#: [.....] (optional)          │
│                                     │
│  ── Price ──                        │
│  ┌─────────────────────────────┐    │
│  │  SUV                 $55.00 │    │
│  │  Room pickup          $5.00 │    │  ← only if checked
│  │  ─────────────────────────  │    │
│  │  Total              $60.00  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   💳  Pay $60.00            │    │  ← big pay button
│  │                             │    │
│  └─────────────────────────────┘    │
│  🔒 Secure payment via Stripe      │
│                                     │
└─────────────────────────────────────┘
```

**Key UX decisions:**
- **Route is already fully set** from Screen 1 — shown as a read-only summary at top (tap goes back to change)
- **No pickup field here** — it was handled on Screen 1 (QR auto-fill or typed by client)
- **Date/time default** to today + next available 30-min slot — most guests want a ride soon
- **Passengers/luggage are tap chips** — no typing, no dropdowns
- Add-ons are simple checkboxes that instantly update the price
- **Price updates live** as they toggle add-ons
- Name + phone are the only typed fields (3 fields max)
- **One big "Pay" button** at the bottom — opens Stripe Checkout
- The selected car shows as a small thumbnail at the top for reassurance

---

### Screen 4: "Booked!" (after payment)

```
┌─────────────────────────────────────┐
│                                     │
│           ✓                         │
│       Ride Booked!                  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [SUV image]                │    │
│  │                             │    │
│  │  Booking #RF-20260324-0042  │    │
│  │                             │    │
│  │  Marriott → Airport         │    │
│  │  Today at 10:30 AM          │    │
│  │  SUV • 3 passengers         │    │
│  │  Total paid: $60.00         │    │
│  └─────────────────────────────┘    │
│                                     │
│  We'll text you at (555) 123-4567   │
│  when your driver is confirmed.     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  📱 Save Booking Details    │    │
│  └─────────────────────────────┘    │
│                                     │
│  Questions? Call (555) 000-0000     │
│                                     │
│  [ Book Another Ride ]              │
│                                     │
└─────────────────────────────────────┘
```

---

## Complete Flow Summary

```
ENTRY: Scan hotel QR          ENTRY: Visit site directly
        │                              │
        ▼                              ▼
   ┌──────────┐                  ┌───────────┐
   │ Where to?│                  │ Pickup +  │
   │ (dest    │                  │ Where to? │
   │  only)   │                  │ (both     │
   │          │                  │  fields)  │
   └────┬─────┘                  └─────┬─────┘
        │                              │
        └──────────┬───────────────────┘
                   ▼
             ┌──────────┐
             │ Pick car │  ← 1 tap (cars with images + prices)
             └────┬─────┘
                  │
                  ▼
             ┌──────────┐
             │ Confirm  │  ← time, passengers, name, phone → Pay
             │ & Pay    │     route already locked from Screen 1
             └────┬─────┘
                  │
                  ▼
             ┌──────────┐
             │ Done!    │  ← SMS coming soon
             └──────────┘
```

---

## Click Count Analysis (Revised)

| Scenario | Taps |
|----------|------|
| QR scan + popular destination + tap car + pay | **3 taps** (destination → car → pay) |
| QR scan + custom destination + tap car + pay | **3 taps** (type address → car → pay) |
| Direct visit + geolocation granted + popular dest + car + pay | **3 taps** (pickup auto-filled → destination → car → pay) |
| Direct visit + type both addresses + car + pay | **4 taps** (pickup → destination → car → pay) + typing |

The key insight: **the route is fully set on Screen 1.** By the time clients see cars and prices, both pickup and destination are locked. No confusion, no surprises on later screens.

---

## Smart Defaults

| Field | Default | Source |
|-------|---------|--------|
| Pickup location | Hotel address | QR code / cashier ref |
| Pickup location (no QR) | Browser geolocation | Auto-detected, editable |
| Date | Today | Auto |
| Time | Next 30-min slot | Auto (e.g., if it's 10:12, suggest 10:30) |
| Passengers | 1 | Auto |
| Luggage | None | Auto |
| Add-ons | None checked | Auto |

Route is locked on Screen 1. Everything else defaults on Screen 3 — client only changes what they need.

---

## Vehicle Card Design Spec

Each vehicle card on Screen 2 should contain:

```
┌─────────────────────────────────────┐
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   [ Vehicle photo ]         │    │  160px height, full width
│  │   clean background          │    │  professional angle
│  │   (white or transparent)    │    │  actual fleet vehicle type
│  │                             │    │
│  ├─────────────────────────────┤    │
│  │                             │    │
│  │  Van                  $65   │    │  name + price (bold, large)
│  │  👤 Up to 8 passengers      │    │  capacity
│  │  🧳 5 bags                  │    │  luggage capacity
│  │  ⏱  ~25 min                 │    │  estimated travel time
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

**Image guidelines:**
- Use the same angle for all vehicles (3/4 front view)
- Clean white/light background (not a photo of a parking lot)
- Show the actual type of vehicle in your fleet (not a stock luxury car if you run Camrys)
- Optimize images for mobile (WebP, ~50KB each)
- Consider showing 2-3 real fleet photos per vehicle type that rotate

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Client needs 6+ people | Auto-highlight Van/Large Van, gray out Sedan/SUV |
| All vehicle types unavailable | Show message: "No vehicles available for this route. Call us." |
| Destination outside geofence | Inline error on Screen 1: "We don't serve this area yet" |
| No QR scan, no pickup entered | Screen 1 shows both fields — can't proceed to Screen 2 until both are filled |
| Upsale active | Client sees nothing different — upsale is silently included in the price shown on car cards |
| Date is >30 days out | Date picker limits to 30-day window |
| Past time selected | Time picker only shows future time slots |

---

## Form Validation Rules

**Screen 1 (route):**
- **Pickup**: required — auto-filled from QR or geolocation, or typed manually. Must be within geofence
- **Destination**: required — selected from popular list or typed. Must be within geofence
- **Both fields must be set** before advancing to Screen 2

**Screen 3 (confirm & pay):**
- **Phone**: required, validated format, used for all SMS
- **Name**: required, min 2 characters
- **Date/Time**: cannot be in the past, within booking window (up to 30 days ahead)
- **Passengers**: if selected count > vehicle capacity, show warning and suggest going back to pick a larger vehicle
