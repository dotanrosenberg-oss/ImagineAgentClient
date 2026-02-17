# WhatsApp Server API (Consolidated)

**Compiled:** 2026-02-16  
**Sources:** Client API v1.10, API Doc v0.4 (stable), Restrictions & Reliability v1.0.

## Overview
This API exposes a server-managed WhatsApp Web session (via a headless browser) and a local database cache. Clients authenticate to the server (not to WhatsApp) and use HTTP + WebSocket to manage groups (“customers”), messages, polls, and group settings.

## Base URL
```
https://YOUR_SERVER_URL
```

## Authentication
### HTTP
Send your API key in the `X-API-Key` header:
```
X-API-Key: YOUR_API_KEY
```
### WebSocket
Pass the key as a query parameter:
```
wss://YOUR_SERVER_URL/ws?apiKey=YOUR_API_KEY
```
### Common auth errors
- **401** Missing API key
- **403** Invalid API key
- **500** Server misconfigured (API key env var not set)

## Availability & Connection Guard
Most WhatsApp-dependent endpoints are protected by a **503 guard**. If the server is not connected to WhatsApp they fail fast with:
```json
{
  "error": "SERVICE_UNAVAILABLE",
  "message": "Server is not connected to WhatsApp"
}
```
Use `GET /api/status` to check readiness.

## Quick Start
1. `GET /api/status` → confirm `ready: true`
2. `POST /api/customers/sync` → import WhatsApp groups as customers
3. `GET /api/customers` → list groups
4. `GET /api/customers/{customerId}/messages?limit=20` → last messages from local DB
5. (optional) `GET /api/whatsapp/messages/{chatId}?limit=200` → backfill history from WhatsApp
6. Connect WebSocket `wss://.../ws?apiKey=...` for real-time updates

## Endpoint Conventions
- Group IDs end with `@g.us` (e.g., `120363...@g.us`)
- User IDs end with `@c.us` (e.g., `15551231234@c.us`)
- Phone number input can be with or without `+`.
- File uploads use `multipart/form-data`.
- Default JSON content type: `application/json`.

## HTTP API
### Health & Status
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | No | Basic health check |
| GET | `/api/status` | No | `{ ready: true/false }` readiness (never guarded) |

### Customers (Groups)
| Method | Path | Description |
|---|---|---|
| GET | `/api/customers` | List customers (synced WA groups) |
| GET | `/api/customers/{id}` | Get one customer |
| DELETE | `/api/customers/{id}` | Delete customer from local DB (does **not** leave group) |
| POST | `/api/customers/sync` | Sync WA groups into local DB |

### Messages
| Method | Path | Description |
|---|---|---|
| GET | `/api/customers/{id}/messages?limit=...` | Messages from local DB |
| GET | `/api/whatsapp/messages/{chatId}?limit=...` | Fetch historical messages from WhatsApp (cached to DB) |
| POST | `/api/customers/{id}/messages` | Send message (JSON text or multipart w/ attachment) |
| PATCH | `/api/customers/{id}/messages/{messageId}` | Edit **own** text message (≈15 min window) |
| DELETE | `/api/customers/{id}/messages/{messageId}` | Delete **own** message (“delete for everyone”) |

#### Send message
**Text (JSON):**
```json
{ "message": "Hello from the API!" }
```
**With attachment (multipart):** fields: `file` (required), `caption` (optional). Max **100MB**.
Message type is inferred from MIME.

### Polls
| Method | Path | Description |
|---|---|---|
| POST | `/api/customers/{id}/poll` | Send poll (2–12 options) |

### Group Management
| Method | Path | Description |
|---|---|---|
| POST | `/api/groups/create` | Create group; add participants; optional icon; optional settings |
| POST | `/api/diagnostics/check-number` | Check if a phone is registered on WhatsApp |
| GET | `/api/customers/{id}/participants?includePhotos=true|false` | List participants (photos optional, slower) |
| PATCH | `/api/customers/{id}/name` | Update group name |
| GET | `/api/customers/{id}/settings` | Get cached group settings |
| PATCH | `/api/customers/{id}/settings` | Update group privacy/permission settings |
| POST | `/api/customers/{id}/participants` | Add participants |
| DELETE | `/api/customers/{id}/participants` | Remove participants |

### Membership Reliability Helpers
| Method | Path | Description |
|---|---|---|
| POST | `/api/groups/add-members` | Add members with failure tracking |
| POST | `/api/groups/join-url` | Generate a shareable join URL token |
| GET | `/api/groups/{groupId}/failed-attempts` | Retrieve tracked member-add failures |
| GET | `/api/groups/{groupId}/join-urls` | Retrieve generated join URLs |
| GET | `/api/groups/join/{token}` | Public join URL handler (no auth) |

## WebSocket API
### Connection

Connect to receive real-time updates:

```
wss://YOUR_SERVER_URL/ws?apiKey=YOUR_API_KEY
```

### Message Types

#### connected

Sent immediately upon successful connection.

```json
{
  "type": "connected",
  "data": {
    "message": "Connected to WhatsApp server"
  }
}
```

---

#### message

Received when a new message arrives.

```json
{
  "type": "message",
  "data": {
    "id": "true_120363123456789@g.us_ABC123",
    "customerId": "120363123456789@g.us",
    "body": "Hello!",
    "fromPhone": "+1234567890",
    "fromName": "John Doe",
    "timestamp": "2025-01-29T10:30:00Z",
    "isFromMe": false,
    "hasMedia": false,
    "messageType": "text"
  },
  "customer": {
    "id": "120363123456789@g.us",
    "name": "Sales Team"
  }
}
```

---

#### message_edit

Received when a previously sent message is edited via the API.

```json
{
  "type": "message_edit",
  "data": {
    "id": "true_120363123456789@g.us_XYZ789",
    "customerId": "120363123456789@g.us",
    "body": "Updated message text",
    "fromPhone": "1234567890@c.us",
    "fromName": "Me",
    "timestamp": "2025-01-29T10:35:00Z",
    "isFromMe": true,
    "hasMedia": false,
    "messageType": "text"
  },
  "customer": {
    "id": "120363123456789@g.us",
    "name": "Sales Team"
  }
}
```

---

#### message_delete

Received when a previously sent message is deleted via the API.

```json
{
  "type": "message_delete",
  "data": {
    "messageId": "true_120363123456789@g.us_XYZ789",
    "customerId": "120363123456789@g.us"
  },
  "customer": {
    "id": "120363123456789@g.us",
    "name": "Sales Team"
  }
}
```

---

#### customer_update

Received when a customer's data changes.

```json
{
  "type": "customer_update",
  "data": {
    "id": "120363123456789@g.us",
    "name": "Sales Team",
    "lastMessage": "New message",
    "lastMessageTime": "2025-01-29T10:30:00Z"
  }
}
```

---

#### customers_synced

Received after sync completes.

```json
{
  "type": "customers_synced",
  "data": [
    {
      "id": "120363123456789@g.us",
      "name": "Sales Team"
    }
  ]
}
```

---

#### service_unavailable

Received if the server loses connection to WhatsApp.

```json
{
  "type": "service_unavailable",
  "data": {
    "message": "Server disconnected from WhatsApp"
  }
}
```

---

#### poll_vote

Received when a group member votes on a poll.

```json
{
  "type": "poll_vote",
  "data": {
    "pollMessageId": "true_120363123456789@g.us_POLL123",
    "customerId": "120363123456789@g.us",
    "voter": "+1234567890",
    "voterName": "John Doe",
    "selectedOptions": ["11:00 AM"],
    "timestamp": "2026-02-05T10:40:00Z"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pollMessageId` | string | ID of the original poll message |
| `customerId` | string | Group ID where the poll was sent |
| `voter` | string | Phone number of the voter |
| `voterName` | string | Display name of the voter |
| `selectedOptions` | string[] | Array of options the voter selected |
| `timestamp` | string | ISO timestamp of when the vote was cast |

---

## Reliability & Operational Guidance
### Endpoint speed tiers & timeouts
The server has **instant** local-read endpoints and **variable-latency** WhatsApp action endpoints. Set client-side timeouts accordingly.

#### Endpoint Speed Tiers

### Tier 1: Instant (< 1 second)

These endpoints read from in-memory state or the local database. They respond almost instantly. However, most still require an active WhatsApp connection (503 guard) — if the server is disconnected, they return 503 immediately rather than hanging.

| Endpoint | Method | Description | Requires connection? |
|----------|--------|-------------|---------------------|
| `/api/status` | GET | Server readiness check | No |
| `/api/health` | GET | Health check (no auth required) | No |
| `/api/customers` | GET | List all customers from database | Yes (503 if disconnected) |
| `/api/customers/:id` | GET | Get single customer from database | Yes (503 if disconnected) |
| `/api/customers/:id/messages` | GET | Get messages from local database | Yes (503 if disconnected) |
| `/api/customers/:id/settings` | GET | Get cached group settings | Yes (503 if disconnected) |
| `/api/groups/:groupId/failed-attempts` | GET | Get failed member attempts | Yes (503 if disconnected) |
| `/api/groups/:groupId/join-urls` | GET | Get generated join URLs | Yes (503 if disconnected) |
| `DELETE /api/customers/:id` | DELETE | Remove customer from local database | No |

**Client timeout:** 5 seconds is more than sufficient.

---

### Tier 2: Moderate (2-15 seconds)

These endpoints make one or two calls to WhatsApp.

| Endpoint | Method | Description | Typical time |
|----------|--------|-------------|-------------|
| `/api/diagnostics/check-number` | POST | Verify a phone number on WhatsApp | 2-8 seconds |
| `/api/customers/:id/participants` | GET | Fetch group participants from WhatsApp | 2-10 seconds |
| `/api/customers/:id/messages` | POST | Send a text message | 2-10 seconds |
| `/api/customers/:id/messages` (with file) | POST | Send a message with attachment | 3-15 seconds |
| `/api/customers/:id/messages/:messageId` | PATCH | Edit a message | 2-8 seconds |
| `/api/customers/:id/messages/:messageId` | DELETE | Delete a message | 2-8 seconds |
| `/api/customers/:id/poll` | POST | Send a poll | 2-10 seconds |
| `/api/customers/:id/name` | PATCH | Update group name | 2-8 seconds |
| `/api/customers/:id/settings` | PATCH | Update group settings | 2-10 seconds |
| `/api/customers/:id/participants` | POST | Add participants to group | 3-15 seconds |
| `/api/customers/:id/participants` | DELETE | Remove participants from group | 3-15 seconds |
| `/api/groups/add-members` | POST | Add members with failure tracking | 3-15 seconds |
| `/api/groups/join-url` | POST | Generate a join URL | 1-3 seconds |

**Client timeout:** 30 seconds recommended.

---

### Tier 3: Slow (5-45 seconds)

These endpoints perform multiple sequential WhatsApp operations.

| Endpoint | Method | Description | Typical time |
|----------|--------|-------------|-------------|
| `/api/groups/create` | POST | Create group + add participants + optional icon + apply settings | 5-30 seconds |
| `/api/customers/sync` | POST | Sync all WhatsApp groups | 5-45 seconds (depends on group count) |
| `/api/whatsapp/messages/:chatId` | GET | Fetch historical messages from WhatsApp servers | 3-30 seconds (depends on message count) |

**Client timeout:** 60 seconds recommended.

**Why `/api/groups/create` is the slowest action endpoint:**

This endpoint performs up to 6 sequential WhatsApp operations:
1. Format and validate participant numbers
2. Call WhatsApp to create the group
3. Fetch the newly created group chat
4. Wait 2 seconds for participants to fully join
5. Re-fetch the group to verify participant list
6. Optionally set the group icon
7. Optionally apply group settings

Each step depends on the previous one, and each involves a round-trip to WhatsApp.

---
#### Client-Side Timeout Recommendations

**Every HTTP request to an action endpoint must have a client-side timeout.** If you do not set a timeout, your request may hang indefinitely in edge cases.

| Endpoint category | Recommended timeout | Absolute maximum |
|-------------------|--------------------|--------------------|
| Status / Health / Local reads | 5 seconds | 10 seconds |
| Single WhatsApp action (check number, send message, edit, delete) | 30 seconds | 45 seconds |
| Multi-step WhatsApp action (create group, sync) | 60 seconds | 90 seconds |
| Historical message fetch | 60 seconds | 90 seconds |

### Example: Setting Timeouts

**JavaScript (fetch with AbortController):**
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30 seconds

try {
  const response = await fetch('https://YOUR_SERVER/api/diagnostics/check-number', {
    method: 'POST',
    headers: {
      'X-API-Key': 'YOUR_API_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ phoneNumber: '+1234567890' }),
    signal: controller.signal
  });
  const data = await response.json();
} catch (err) {
  if (err.name === 'AbortError') {
    console.error('Request timed out after 30 seconds');
  }
} finally {
  clearTimeout(timeout);
}
```

**Python (requests):**
```python
import requests

try:
    response = requests.post(
        'https://YOUR_SERVER/api/diagnostics/check-number',
        headers={'X-API-Key': 'YOUR_API_KEY'},
        json={'phoneNumber': '+1234567890'},
        timeout=30  # 30 seconds
    )
    data = response.json()
except requests.Timeout:
    print('Request timed out after 30 seconds')
```

**curl:**
```bash
curl --max-time 30 -X POST "https://YOUR_SERVER/api/diagnostics/check-number" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'
```

---
### Retry strategy
### When to Retry

| Scenario | Retry? | Strategy |
|----------|--------|----------|
| 503 Service Unavailable | Yes | Exponential backoff: 5s, 10s, 30s, 60s |
| 500 Server Error | Yes (once) | Wait 5 seconds, retry once |
| Client-side timeout | Yes (once) | Wait 10 seconds, retry once |
| 408 per-participant timeout | Yes | Retry the specific participant only |
| 400 Bad Request | No | Fix the request payload |
| 401/403 Auth Error | No | Fix the API key |
| 404 Not Found | No | Verify the resource ID |
| 422 Validation Error | No | Fix the input data |

### Retry Best Practices

1. **Never retry group creation blindly.** If the request timed out, check `GET /api/customers` first - the group may have been created even though you didn't receive the response.

2. **Always use exponential backoff** for 503 errors. The server is reconnecting to WhatsApp and hammering it with retries will not help.

3. **Set a maximum retry count.** 3 retries is a sensible maximum for any operation.

4. **Log every retry** with the original request details so you can debug patterns.

---

### Rate limits & WhatsApp restrictions
The server does not enforce rate limits itself, but WhatsApp does. Exceeding these recommendations risks your account being flagged or temporarily blocked by WhatsApp.

| Operation | Recommended limit | Risk if exceeded |
|-----------|-------------------|-----------------|
| Messages per group | Max 1 message per second | Temporary message block |
| Group creation | Max 1 group per minute | Account restriction |
| Participant additions | Space out by 1-2 seconds per participant | Privacy/spam flags |
| Number lookups | Max 1 per second | Temporary lookup block |
| Group sync | Max once every 5 minutes | Excessive API calls |

### WhatsApp Account-Level Restrictions

- New WhatsApp accounts have stricter rate limits
- Sending too many messages to non-contacts may trigger spam detection
- Creating many groups in a short period can result in a temporary ban
- Adding users who frequently block or report the account increases risk

---

### Error handling
Errors follow one of two structures depending on the endpoint:

**With error code and message (group/settings endpoints):**
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable explanation"
}
```

**With error only (most other endpoints):**
```json
{
  "error": "Human-readable error message"
}
```

Your client code should check for both the `error` field (always present) and the optional `message` field.

### Complete Error Code Reference

| HTTP Status | Error Code | When it occurs | Action to take |
|-------------|------------|----------------|----------------|
| 400 | (validation errors) | Invalid request body (missing fields, wrong types) | Fix the request payload |
| 400 | `NOT_A_GROUP` | Endpoint requires a group chat but the ID points to an individual chat | Use a group ID (ending in `@g.us`) |
| 401 | `Missing API key` | No `X-API-Key` header provided | Add the API key header |
| 403 | `Invalid API key` | Wrong API key value | Use the correct API key |
| 403 | `FORBIDDEN` | Operation requires admin privileges in the WhatsApp group | Ensure the server account is a group admin |
| 404 | `GROUP_NOT_FOUND` | No group with the specified ID exists | Verify the group ID, or sync groups first |
| 404 | `Message not found` | No message with the specified ID exists for the given customer | Verify the message ID |
| 404 | `Customer not found` | No customer with the specified ID exists in the database | Sync customers first via `POST /api/customers/sync` |
| 410 | `already_used` / `expired` | Join URL token has been used or expired | Generate a new join URL |
| 422 | `ALL_PARTICIPANTS_FAILED` | Group was created but zero participants could be added | See response body for per-participant failure reasons |
| 422 | `Only text messages can be edited` | Attempted to edit a media/poll/sticker message | Only text messages support editing |
| 422 | `Edit window expired` | WhatsApp's ~15 minute edit window has passed | Cannot edit; send a new message instead |
| 500 | (varies) | Unexpected server error | Report the error; check server logs |
| 503 | `SERVICE_UNAVAILABLE` | Server not connected to WhatsApp | Wait and retry; check `/api/status` |

### The ALL_PARTICIPANTS_FAILED Error (422)

When creating a group, if none of the requested participants can be added (all fail due to privacy settings, invalid numbers, etc.), you receive a detailed response:

```json
{
  "success": false,
  "error": "ALL_PARTICIPANTS_FAILED",
  "message": "None of the requested participants could be added to the group. The group was created but contains only the bot.",
  "groupId": "120363123456789@g.us",
  "groupName": "#Chuku",
  "results": {
    "added": [],
    "failed": [
      {
        "number": "1234567890",
        "reason": "The phone number is not registered on WhatsApp",
        "statusCode": 404
      }
    ]
  },
  "summary": {
    "totalRequested": 1,
    "successfullyAdded": 0,
    "failedToAdd": 1
  },
  "suggestion": "Verify that all phone numbers are registered on WhatsApp and have privacy settings that allow being added to groups."
}
```

**Important:** The group IS created in this case (it just has no participants except the bot). Your client should decide whether to keep or delete the empty group.

### Per-Participant Failure Status Codes

When creating a group or adding members, each participant can individually fail. The `statusCode` field tells you why:

| Status Code | Meaning | Retryable? |
|-------------|---------|------------|
| 200 | Successfully added | N/A |
| 403 | Privacy settings prevent adding to groups | No (user must change their settings) |
| 404 | Phone number not registered on WhatsApp | No (wrong number or not on WhatsApp) |
| 408 | Request timed out | Yes (retry after delay) |
| 409 | Already in the group | No (already a member) |
| 500 | Server error during addition | Yes (retry after delay) |

---

### Payload constraints
### Phone Number Format

| Context | Format | Examples |
|---------|--------|----------|
| Input (requests) | With or without `+` prefix | `+1234567890` or `1234567890` |
| Output (responses) | Digits only, no `+` | `1234567890` |
| WhatsApp IDs (responses) | Full format with suffix | Individual: `1234567890@c.us`, Group: `120363123456789@g.us` |

### Group Creation (`POST /api/groups/create`)

| Constraint | Value |
|-----------|-------|
| Group name | Required, non-empty string |
| Participants | At least 1 phone number required |
| Settings | Optional JSON object |
| Icon file | Optional; any file type is accepted by the upload, but non-image files are rejected at validation (MIME must start with `image/`). JPEG/PNG recommended. |
| Icon max size | 100 MB (shared file upload limit) |
| Content types | `application/json` (no icon) or `multipart/form-data` (with icon) |

### Messages (`POST /api/customers/:id/messages`)

| Constraint | Value |
|-----------|-------|
| Text message | Non-empty string in `message` field |
| File attachment | Any file type, max 100 MB |
| Caption with file | Optional string in `caption` field |

### Message Editing (`PATCH /api/customers/:id/messages/:messageId`)

| Constraint | Value |
|-----------|-------|
| Only own messages | `isFromMe` must be `true` |
| Only text messages | Media, poll, and sticker messages cannot be edited |
| Time window | ~15 minutes after original send time (enforced by WhatsApp) |

### Message Deletion (`DELETE /api/customers/:id/messages/:messageId`)

| Constraint | Value |
|-----------|-------|
| Only own messages | `isFromMe` must be `true` |
| Any message type | Text, media, poll, sticker - all can be deleted |

### Polls (`POST /api/customers/:id/poll`)

| Constraint | Value |
|-----------|-------|
| Question | Required, max 255 characters |
| Options | 2-12 options, each max 100 characters |
| Multiple answers | Optional boolean, defaults to `false` |

### Historical Messages (`GET /api/whatsapp/messages/:chatId`)

| Constraint | Value |
|-----------|-------|
| Limit parameter | Default 100, max 500 |

### Join URLs

| Constraint | Value |
|-----------|-------|
| Token length | 64 characters (hex) |
| Expiration | 7 days from creation |
| Single use | Each token can only be used once |

---

### Known limitations
1. **External WhatsApp API may return incomplete participant data.** The server calculates participant counts locally to compensate.

2. **Promotion to admin may silently fail** for participants with certain privacy settings. The response will indicate success, but the participant may not actually be promoted.

3. **Profile pictures are not available for all participants** due to WhatsApp privacy settings. The `profilePicUrl` field may be `null`.

4. **Group creation includes a 2-second internal wait** after creating the group to allow participants to fully join before verifying the member list. This is intentional and contributes to the endpoint's response time.

5. **Message edit window is approximate.** WhatsApp enforces a ~15 minute edit window, but the exact cutoff is determined by WhatsApp's servers, not by this API.

6. **The server manages one WhatsApp session.** All API requests share a single WhatsApp connection. Heavy concurrent usage of action endpoints may cause contention.

7. **Historical message fetch saves to local database.** Calling `GET /api/whatsapp/messages/:chatId` also caches the messages locally. Subsequent calls to `GET /api/customers/:id/messages` will include these messages.

---

## Optional / Legacy WhatsApp Session Management (v0.4)
Some deployments expose explicit WhatsApp session lifecycle endpoints (QR flow). If your server manages the session internally, you may not need these.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/whatsapp/status` | Connection state (`disconnected`, `qr_ready`, `ready`, etc.) |
| POST | `/api/whatsapp/connect` or `/api/whatsapp/init` | Start connection / initialize client |
| POST | `/api/whatsapp/disconnect` | Disconnect session |
| POST | `/api/whatsapp/sync-groups` | Legacy alias for syncing groups |
| POST | `/api/whatsapp/create-group` | Legacy alias for group creation (JSON-only) |
| POST | `/api/whatsapp/diagnostics` | Legacy alias for number check |

If both sets exist, prefer the **v1.10** endpoints under `/api/customers/*`, `/api/groups/*`, and `/api/diagnostics/*`.
