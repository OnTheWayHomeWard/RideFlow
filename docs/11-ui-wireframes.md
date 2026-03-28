# 11 — UI Wireframes & Design System

## Design Principles
1. **Mobile-first** — 95% of clients will use phones
2. **Minimal input** — tappable options over typing
3. **Speed** — page loads under 2 seconds
4. **Trust** — clean, professional, shows prices upfront

---

## Color Palette

| Color | Hex | Use |
|-------|-----|-----|
| Primary Blue | #1E40AF | Buttons, headers, links |
| Dark Navy | #0F172A | Text, navbar |
| Success Green | #16A34A | Confirmations, completed status |
| Warning Amber | #F59E0B | Pending states, alerts |
| Error Red | #DC2626 | Errors, cancellations |
| Light Gray | #F1F5F9 | Backgrounds, cards |
| White | #FFFFFF | Card backgrounds |

---

## Client Booking Site — Screen Flow

```
┌─────────┐    ┌───────────┐    ┌──────────┐    ┌──────────────┐
│  Where?  │───>│  Details  │───>│ Confirm  │───>│ Confirmation │
│(Screen 1)│    │(Screen 2) │    │  & Pay   │    │   (Screen 4) │
└─────────┘    └───────────┘    │(Screen 3)│    └──────────────┘
                                └──────────┘
```

### Responsive Layout
- Mobile: single column, full-width cards
- Tablet: slightly wider cards, same flow
- Desktop: centered container (max 480px) — feels like a mobile app

---

## Driver Portal — Screen Flow

```
┌─────────┐    ┌────────────┐    ┌──────────┐
│  Login   │───>│ Dashboard  │───>│  Active  │
│          │    │ (Available │    │   Ride   │
└─────────┘    │  + My Runs)│    │  Screen  │
               └─────┬──────┘    └──────────┘
                     │
               ┌─────┴──────┐
               │  Earnings   │
               │  & History  │
               └─────────────┘
```

### Driver Active Ride Screen

```
┌─────────────────────────────────┐
│  Active Ride                    │
│                                 │
│  Client: John Smith             │
│  Room: 412                      │
│  Pickup: Marriott, 123 Main St │
│  Dropoff: Airport Terminal 2    │
│  Passengers: 3                  │
│  Luggage: 1-2 bags             │
│                                 │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  │    [ 🟢 START RIDE ]       │ │  ← big green button
│  │                            │ │
│  └────────────────────────────┘ │
│                                 │
│  --- after starting ---         │
│                                 │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  │   [ ✓ COMPLETE RIDE ]      │ │  ← big button
│  │                            │ │
│  └────────────────────────────┘ │
│                                 │
│  Need help? Call dispatch       │
└─────────────────────────────────┘
```

---

## Admin Dashboard — Layout

```
┌──────────────────────────────────────────────────────────┐
│  RideFlow Admin                          [🔔] [Profile] │
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│ Dashboard│  [Main Content Area]                          │
│ Runs     │                                               │
│ Drivers  │  Cards, tables, charts depending              │
│ Cashiers │  on selected section                          │
│ Hotels   │                                               │
│ Pricing  │                                               │
│ Routes   │                                               │
│ Upsales  │                                               │
│ Reports  │                                               │
│ Settings │                                               │
│          │                                               │
└──────────┴───────────────────────────────────────────────┘
```

---

## Key UI Components

### Booking Card (used on client site for common routes)

```
┌──────────────────────────────┐
│  🏨 → ✈️                     │
│  Hotel District → Airport    │
│  ~12 miles • 25 min          │
│                              │
│  From $35                    │
│  [ Book This Route → ]       │
└──────────────────────────────┘
```

### Run Card (used in driver portal)

```
┌──────────────────────────────┐
│  🔔 NEW                     │
│  10:30 AM Today              │
│  Marriott → Airport          │
│  3 pax • SUV                 │
│  Your earnings: $38.50       │
│                              │
│  [ ACCEPT ]                  │
└──────────────────────────────┘
```

### Stat Card (used in admin dashboard)

```
┌──────────────┐
│  Today       │
│  34 rides    │
│  $2,040      │
│  ▲ 12% vs   │
│  yesterday   │
└──────────────┘
```

---

## Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| H1 (page title) | Inter | 24px | Bold |
| H2 (section) | Inter | 20px | Semibold |
| Body | Inter | 16px | Regular |
| Small / caption | Inter | 14px | Regular |
| Button text | Inter | 16px | Semibold |
| Price (large) | Inter | 28px | Bold |

---

## Interaction Patterns

| Pattern | Implementation |
|---------|---------------|
| Address input | Google Places Autocomplete |
| Date picker | Native HTML date input (mobile-friendly) |
| Time picker | Dropdown with 30-min intervals |
| Passenger count | Tappable number buttons (1-2-3-4+) |
| Vehicle selection | Tappable cards with price |
| Rating | Tappable stars |
| Payment | Stripe Checkout (hosted page) |
