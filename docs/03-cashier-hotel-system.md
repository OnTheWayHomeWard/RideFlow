# 03 — Cashier & Hotel System

## Concept
Hotels are a major source of rides. Cashiers (front desk staff) refer clients by providing a QR code. When a client books through that QR, the cashier earns a commission (tip/referral fee).

---

## How It Works

### QR Code Flow

```
Hotel Front Desk has a printed/displayed QR code
  ↓
Guest scans QR with phone camera
  ↓
Opens: https://rideflow.com/book?ref=CASHIER_ABC123
  ↓
System auto-populates:
  - Cashier ID (for commission tracking)
  - Hotel name & address (as default pickup)
  ↓
Guest books normally
  ↓
After ride completes:
  - Cashier gets their % commission
  - Payment auto-split includes cashier cut
```

### QR Code Design
Each cashier gets a unique QR code that:
- Contains their cashier reference ID
- Is printable (card-sized for front desk display)
- Can be regenerated if compromised
- Admin can generate/download from dashboard

---

## Cashier Registration

### Option A: Admin adds cashier
```
Admin → Cashier Management → Add Cashier
  Fill: name, phone, hotel, email
  → Cashier gets SMS with login credentials
```

### Option B: Self-registration
```
Cashier visits → /cashier/register
  Fills: name, phone, email, hotel name
  → Status = PENDING
  → Admin gets notification
  → Admin approves/rejects
  → Cashier gets SMS: "Approved! Your QR code is at /cashier/qr"
```

---

## Cashier Portal

Cashiers have a simple portal to:

```
┌─────────────────────────────────┐
│  Hi, Sarah (Marriott) 👋       │
│                                 │
│  ── Your QR Code ──             │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  │      [QR CODE IMAGE]      │ │
│  │                            │ │
│  │  [ 📥 Download ]  [ 🖨 Print ] │
│  └────────────────────────────┘ │
│                                 │
│  ── This Month ──               │
│  Referrals: 47                  │
│  Earnings:  $282.00             │
│                                 │
│  ── Recent Bookings ──          │
│  Mar 24  Room 412 → Airport $6  │
│  Mar 24  Room 208 → Downtown $3 │
│  Mar 23  Room 615 → Mall     $2 │
│                                 │
│  [ View Full History ]          │
└─────────────────────────────────┘
```

---

## Commission Calculation

### Default Setting
```
cashier_commission_enabled = true  (by default)
cashier_tip_percentage = 10%       (configurable per hotel or globally)
```

### Calculation Example
```
Total fare: $60.00
Cashier commission (10%): $6.00
Remaining: $54.00
Driver cut (70% of remaining): $37.80
Company cut: $16.20
```

### Configurable per hotel
Different hotels may negotiate different commission rates:
- Hotel A: 10% cashier commission
- Hotel B: 15% cashier commission (high-volume partner)
- Hotel C: 8% cashier commission

---

## Cashier Data Model

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | string | Full name |
| phone | string | Contact |
| email | string | Optional |
| password_hash | string | For portal login |
| hotel_id | UUID | FK to hotels table |
| ref_code | string | Unique code for QR (e.g., CASHIER_ABC123) |
| qr_code_url | string | Generated QR image URL |
| commission_pct | decimal | Override hotel default if set |
| status | enum | PENDING, ACTIVE, INACTIVE |
| total_referrals | integer | Counter |
| total_earnings | decimal | Running total |
| created_at | timestamp | |
| approved_at | timestamp | |

---

## Hotel Data Model

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | string | Hotel name |
| address | string | Full address |
| lat | decimal | Latitude |
| lng | decimal | Longitude |
| default_commission_pct | decimal | Default cashier commission for this hotel |
| contact_name | string | Hotel manager/contact |
| contact_phone | string | |
| is_active | boolean | |
| created_at | timestamp | |

---

## Hotel as Pickup Shortcut

When a booking comes through a hotel QR:
- Pickup address = hotel address (pre-filled, editable)
- The hotel name shows on the booking for easy tracking
- Admin can report rides per hotel

---

## Multiple Cashiers per Hotel
A hotel can have multiple cashiers (different shifts, different staff). Each has their own QR code and earns individually. Admin can see:
- Total rides per hotel (all cashiers combined)
- Rides per individual cashier
- Commission paid per cashier
