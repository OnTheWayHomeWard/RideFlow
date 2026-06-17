# FCM & In-App Notifications — API Reference

Push notifications (via Firebase Cloud Messaging) plus a persisted in-app
notifications inbox for **admin**, **driver**, and **cashier** staff users.
All endpoints share a single auth model — any valid JWT from any of the three
staff roles works.

- **Base URL:** `https://ride.gobellme.com`
- **Prefix:** `/api/notifications`
- **Auth:** `Authorization: Bearer <JWT>` (admin / driver / cashier)
- **Content-Type:** `application/json`
- **Swagger:** [`/api/docs`](https://ride.gobellme.com/api/docs) under the `notifications` tag

---

## Endpoint summary

| Method | Path | Purpose |
|---|---|---|
| `POST`   | `/api/notifications/register-fcm`     | Register / upsert a device's FCM token |
| `DELETE` | `/api/notifications/fcm`              | Remove a device's FCM token (logout) |
| `GET`    | `/api/notifications`                  | Paginated inbox for the current user |
| `GET`    | `/api/notifications/unread-count`     | Count unread for the bell badge |
| `PUT`    | `/api/notifications/{id}/read`        | Mark one notification as read |
| `PUT`    | `/api/notifications/read-all`         | Mark every unread as read |
| `POST`   | `/api/notifications/test-push`        | Send a test push to your own devices |

All endpoints return `401 Unauthorized` if the JWT is missing, invalid, or
expired, and `403 Forbidden` if you try to act on another user's row.

---

## How the pipeline works

Every business event (booking paid, driver assigned, ride started, ride
completed, contact form submitted, …) calls a single helper on the backend:

```python
await notify(
    db,
    recipient_type="admin",   # or "driver" / "cashier"
    recipient_id=<uuid>,
    kind="new_booking",
    title="New booking RF-20260615-1234",
    body="Sol — Ritz-Carlton Orlando → MCO (2026-06-15 18:30)",
    link="/admin/runs/<booking_id>",
    related_type="booking",
    related_id=<booking_id>,
)
```

It does two things:

1. **Persists a row** in the `notifications` table for the recipient (this
   powers the in-app inbox / bell badge).
2. **Fans out via FCM** to every active token the recipient has registered
   (so their Android app gets an OS-level push).

If Firebase isn't configured (`FIREBASE_CREDENTIALS_PATH` is empty or the
file is missing), step 2 is a silent no-op — the inbox still works. Tokens
that Firebase rejects as not-registered are automatically deactivated so we
stop sending to dead devices.

---

## 1. `POST /api/notifications/register-fcm` — Upsert FCM token

Call this **right after login** and again any time the FCM SDK rotates the
token (`onNewToken` in Android).

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | ✅ | The current FCM token from the Android SDK |
| `user_agent` | string | optional | Free-form identifier for the device (e.g. `"BellMe Android 1.0.3 (Pixel 7, Android 14)"`) — helps you tell which device is which later |

### Example

```http
POST /api/notifications/register-fcm
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "token": "fGxYz4kQS3OS_5R0qBmKw9:APA91bF...long-fcm-token...",
  "user_agent": "BellMe Android 1.0.3 (Pixel 7, Android 14)"
}
```

### Response — `200 OK`

```json
{
  "id": "9d6f3b8e-2f4a-4f7e-9b21-7c8e5a0d4321",
  "registered": true
}
```

### Behavior

- If the token already exists in the DB, it's **reassigned** to the current
  user (handles a single device switching accounts) and `is_active` flips
  back on. `last_used_at` is refreshed.
- Otherwise a new row is created. Token column is `UNIQUE` — duplicates
  cannot accumulate.

### Errors

| Status | Reason |
|---|---|
| `400` | `token` is missing or empty |
| `401` | JWT missing / invalid |

---

## 2. `DELETE /api/notifications/fcm` — Remove FCM token (logout)

Call at logout so the next user on that device doesn't keep getting pushes
intended for the previous one.

### Request body

```json
{ "token": "fGxYz4kQS3OS_5R0qBmKw9:APA91bF..." }
```

### Response — `200 OK`

```json
{ "deleted": 1 }
```

`deleted: 0` is **not an error** — it just means the token wasn't registered
for the current user.

---

## 3. `GET /api/notifications` — List inbox

Paginated, newest first. Filtered to the current user.

### Query parameters

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | |
| `per_page` | integer 1–100 | `20` | |
| `unread_only` | boolean | `false` | If `true`, only return unread rows |

### Example

```http
GET /api/notifications?page=1&per_page=20&unread_only=true
Authorization: Bearer ...
```

### Response — `200 OK`

```json
{
  "notifications": [
    {
      "id": "a4f8b2c1-e5d3-4b6a-92c7-1f0e8d3b5c4a",
      "kind": "new_booking",
      "title": "New booking RF-20260615-1234",
      "body": "Sol — Ritz-Carlton Orlando → MCO (2026-06-15 18:30). $189.",
      "link": "/admin/runs/abc-123",
      "related_type": "booking",
      "related_id": "abc-123",
      "is_read": false,
      "read_at": null,
      "created_at": "2026-06-15T13:42:01.123456+00:00"
    }
  ],
  "total": 47,
  "page": 1,
  "per_page": 20,
  "total_pages": 3
}
```

### Field reference

| Field | Description |
|---|---|
| `id` | UUID — use this for `PUT /{id}/read` |
| `kind` | Short event keyword (see [Notification kinds](#notification-kinds)) — use to pick icons/colors in the UI, or to route taps in the Android app |
| `title` | Short one-line headline shown on the OS push and in the inbox card |
| `body` | Longer body text |
| `link` | In-app deep link (relative to your staff portal base URL). Open this when the inbox card is tapped |
| `related_type`, `related_id` | Helps the UI drill into the underlying record (e.g. the booking) without re-parsing the link |
| `is_read`, `read_at` | Read state. `read_at` is null until the row is marked read |
| `created_at` | ISO 8601 with UTC offset |

---

## 4. `GET /api/notifications/unread-count` — For the bell badge

A 30-second polling endpoint for the header bell.

### Example

```http
GET /api/notifications/unread-count
Authorization: Bearer ...
```

### Response — `200 OK`

```json
{ "count": 3 }
```

---

## 5. `PUT /api/notifications/{id}/read` — Mark one as read

Idempotent. Returns `200` whether the row was already read or not.

### Example

```http
PUT /api/notifications/a4f8b2c1-e5d3-4b6a-92c7-1f0e8d3b5c4a/read
Authorization: Bearer ...
```

### Response — `200 OK`

```json
{
  "id": "a4f8b2c1-e5d3-4b6a-92c7-1f0e8d3b5c4a",
  "is_read": true
}
```

### Errors

| Status | Reason |
|---|---|
| `400` | `{id}` is not a valid UUID |
| `404` | Notification doesn't exist |
| `403` | The notification belongs to someone else |

---

## 6. `PUT /api/notifications/read-all` — Mark all unread as read

### Request

```http
PUT /api/notifications/read-all
Authorization: Bearer ...
```

(no body)

### Response — `200 OK`

```json
{ "marked_read": 7 }
```

---

## 7. `POST /api/notifications/test-push` — Send a test push to yourself

Useful to verify the entire pipeline end-to-end (Firebase init → token
lookup → multicast send) right after you set up Firebase.

### Request body

| Field | Type | Default |
|---|---|---|
| `title` | string | `"Test notification"` |
| `body` | string | `"This is a test push from the staff portal."` |

### Example

```http
POST /api/notifications/test-push
Authorization: Bearer ...
Content-Type: application/json

{
  "title": "Test notification",
  "body": "Hi Sol — if you see this, FCM is working."
}
```

### Response — `200 OK`

```json
{
  "sent": 1,
  "failed": 0,
  "no_tokens": false,
  "disabled": false
}
```

### Interpreting the response

| Field | Meaning |
|---|---|
| `sent` | Number of devices Firebase accepted the push for |
| `failed` | Number Firebase rejected (these get auto-deactivated if the cause was an invalid token) |
| `no_tokens: true` | The current user has no active tokens registered — call `register-fcm` first |
| `disabled: true` | Server-side Firebase is not configured (no `FIREBASE_CREDENTIALS_PATH` or the file is missing) — the in-app inbox still works, but nothing is being sent to Firebase |

---

## What the Android app receives

For every `notify(...)` on the backend (including `test-push`), Firebase
delivers a multicast message with this shape:

```json
{
  "notification": {
    "title": "<title>",
    "body":  "<body>"
  },
  "data": {
    "kind":            "new_booking",
    "notification_id": "a4f8b2c1-e5d3-4b6a-92c7-1f0e8d3b5c4a",
    "link":            "/admin/runs/abc-123",
    "related_type":    "booking",
    "related_id":      "abc-123"
  },
  "android": { "priority": "high" }
}
```

The `data` payload is delivered as-is to your Android `onMessageReceived`
handler. Use `data.link` to deep-link inside the app when the user taps the
notification, and `data.notification_id` if you want to mark it read on the
backend (`PUT /api/notifications/{notification_id}/read`).

### Notification `kind` values currently emitted

| `kind` | Recipient | Triggered by |
|---|---|---|
| `new_booking` | every admin | A rider pays / a booking flips to `paid` |
| `driver_assigned` | the assigned driver | Admin assigns a driver to a booking |
| `driver_accepted` | every admin | Driver taps **Accept** on a pending run |
| `ride_started` | every admin | Driver taps **Start Ride** |
| `ride_completed` | every admin | Driver taps **Complete Ride** |
| `contact_form` | every admin | A visitor submits the contact form on `gobellme.com` |
| `test` | the requester | `POST /test-push` |

More can be added later by calling `notifications_service.notify(...)` at
the relevant event in the backend; no client changes required.

---

## End-to-end smoke test (curl)

```bash
# 1) Log in (driver in this example) — grab the access_token
TOKEN=$(curl -s -X POST https://ride.gobellme.com/api/auth/driver/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+12345550123","password":"yourpass"}' | jq -r .access_token)

# 2) Register an FCM token
curl -X POST https://ride.gobellme.com/api/notifications/register-fcm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_REAL_FCM_TOKEN_HERE","user_agent":"smoke test"}'

# 3) Send a test push to yourself
curl -X POST https://ride.gobellme.com/api/notifications/test-push \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","body":"from curl"}'

# 4) See it in your inbox
curl -X GET "https://ride.gobellme.com/api/notifications?page=1&per_page=10" \
  -H "Authorization: Bearer $TOKEN"

# 5) Unread count for the bell
curl -X GET https://ride.gobellme.com/api/notifications/unread-count \
  -H "Authorization: Bearer $TOKEN"

# 6) Mark all read
curl -X PUT https://ride.gobellme.com/api/notifications/read-all \
  -H "Authorization: Bearer $TOKEN"

# 7) On logout — drop the FCM token
curl -X DELETE https://ride.gobellme.com/api/notifications/fcm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_REAL_FCM_TOKEN_HERE"}'
```

---

## Android client integration (sketch)

```kotlin
// After successful login → response carries access_token
val jwt = loginResponse.access_token

// Get the device's current FCM token and register it server-side
FirebaseMessaging.getInstance().token.addOnSuccessListener { fcmToken ->
    api.registerFcm(
        authorization = "Bearer $jwt",
        body = RegisterFcmRequest(
            token = fcmToken,
            user_agent = "BellMe Android ${BuildConfig.VERSION_NAME} (${Build.MODEL}, Android ${Build.VERSION.RELEASE})"
        )
    )
}

// Also re-register whenever the FCM SDK rotates the token
class MyMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // re-call register-fcm with the user's current JWT
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val kind   = message.data["kind"] ?: "generic"
        val link   = message.data["link"] ?: ""
        val title  = message.notification?.title.orEmpty()
        val body   = message.notification?.body.orEmpty()
        // Render an OS notification (NotificationCompat.Builder)
        // On tap: deep-link to `link` inside the app
    }
}

// On explicit logout, clear the token server-side
api.deleteFcm(
    authorization = "Bearer $jwt",
    body = DeleteFcmRequest(token = currentFcmToken)
)
```

---

## Server-side configuration

Required env var (just one):

```env
# .env at the project root
FIREBASE_CREDENTIALS_PATH=/app/firebase-service-account.json
```

The file `firebase-service-account.json` lives at the project root and is
bind-mounted into the backend container at `/app/firebase-service-account.json`
(read-only) via `docker-compose.prod.yml`. `firebase-admin` reads
`project_id`, `client_email`, and `private_key` directly from that JSON — no
other env vars needed.

To verify the server picked it up:

```bash
docker logs $(docker ps --filter "name=backend" -q) 2>&1 | grep -i fcm | tail -5
# Expected: [fcm] Firebase Admin initialized
# Bad:      [fcm] FIREBASE_CREDENTIALS_PATH not set
# Bad:      [fcm] credentials file not found at /app/firebase-service-account.json
```

---

## Storage model (for reference)

Two tables, both added in alembic revision `e1f2a3b4c5d6`:

### `fcm_tokens` — one row per device

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `owner_type` | varchar(20) | `"admin"` / `"driver"` / `"cashier"` |
| `owner_id` | uuid | Foreign-keyless reference to the staff user |
| `token` | text | **Unique** — duplicates collapse via upsert |
| `user_agent` | varchar(255) nullable | Free-form |
| `is_active` | boolean | Set false when Firebase rejects it as not-registered |
| `created_at`, `last_used_at` | timestamptz | |

### `notifications` — one row per recipient, per event

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `recipient_type` | varchar(20) | `"admin"` / `"driver"` / `"cashier"` |
| `recipient_id` | uuid | |
| `kind` | varchar(50) | Event keyword |
| `title` | varchar(200) | |
| `body` | text | |
| `link` | varchar(500) nullable | In-app deep link |
| `related_type` | varchar(50) nullable | e.g. `"booking"` |
| `related_id` | uuid nullable | e.g. the booking id |
| `is_read` | boolean | indexed |
| `read_at` | timestamptz nullable | |
| `created_at` | timestamptz | indexed |
