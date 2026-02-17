# WhatsApp Server - Complete API Documentation

## Version 1.12

**Architecture Overview:**
This API provides access to a WhatsApp Server instance. Each server maintains a persistent connection to a single WhatsApp identity (phone number). Clients authenticate with the server using an API key and consume WhatsApp resources through this abstraction layer. The server supports both WhatsApp **groups** and individual **contacts** (1-on-1 chats) as customers.

This server acts as a bridge between your application and a live WhatsApp session running through a headless browser (Puppeteer). Understanding this is critical for building a reliable integration.

**Two categories of endpoints exist:**

| Category | What it does | Speed |
|----------|-------------|-------|
| **Read-only / Local** | Returns data from the server's in-memory state or local database | Instant (< 1 second) |
| **Action / WhatsApp-dependent** | Sends a command to WhatsApp via the headless browser and waits for a response | Variable (2-30+ seconds) |

**Action endpoints depend on:**
- The headless browser (Puppeteer) being responsive
- WhatsApp's servers acknowledging the request
- Network latency between the server and WhatsApp
- WhatsApp's own internal processing time (e.g., verifying phone numbers, creating groups)

If any of these stall, the HTTP request can take significantly longer than expected. Your client code **must** set appropriate timeouts on action endpoints.

**Key Principles:**
- The server owns and manages the WhatsApp connection
- Clients authenticate with the server, not with WhatsApp
- If the server is not connected to WhatsApp, all data endpoints return a service unavailable error
- Clients receive data and real-time updates without knowledge of WhatsApp internals
- Customers can be either `group` (WhatsApp groups) or `contact` (individual 1-on-1 chats)
- Messaging endpoints work for both groups and contacts; group management endpoints are restricted to groups only

---

## Base URL

```
https://YOUR_SERVER_URL
```

---

## Authentication

All API requests require an API key in the `X-API-Key` header:

```
X-API-Key: YOUR_API_KEY
```

### Client API Key (`X-API-Key` header)

| Rule | Detail |
|------|--------|
| Required on | All `/api/*` endpoints except `/api/health` and `/api/groups/join/:token` |
| Header name | `X-API-Key` |
| Missing key | `401 {"error":"Missing API key. Include X-API-Key header."}` |
| Wrong key | `403 {"error":"Invalid API key"}` |
| Server misconfigured | `500 {"error":"Server misconfigured - API key not set"}` (when `API_KEY` env var is missing) |

### Admin API Key (separate, for admin-only endpoints)

Admin endpoints under `/api/admin/*` accept the `ADMIN_API_KEY`. If `ADMIN_API_KEY` is not set, the server falls back to `API_KEY`.

Browser requests to the dashboard UI (no API key header) are allowed through.

### WebSocket Authentication

Include the API key as a query parameter:

```
wss://YOUR_SERVER_URL/ws?apiKey=YOUR_API_KEY
```

### Public Endpoints (no auth required)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Health check |
| `GET /api/groups/join/:token` | Process a join URL (shareable link) |

### Authentication Errors

| Status Code | Error Message |
|-------------|---------------|
| 401 | Missing API key. Include X-API-Key header. |
| 403 | Invalid API key |
| 500 | Server misconfigured - API key not set |

---

## Server Availability / Connection Guard (503 Service Unavailable)

When the server is not connected to WhatsApp, **all guarded data endpoints** return:

```
HTTP 503 Service Unavailable
```

```json
{
  "error": "SERVICE_UNAVAILABLE",
  "message": "Server is not connected to WhatsApp"
}
```

Clients should handle this gracefully and retry later. The server connection is managed internally - clients do not need to take any action to establish it.

### Which endpoints are guarded?

**Guarded (require active WhatsApp connection):**

Every endpoint listed below has the connection guard applied. If the server is not connected to WhatsApp, they all return 503 immediately:

- `GET /api/customers` - List customers
- `GET /api/customers/:id` - Get single customer
- `GET /api/customers/:id/messages` - Get messages
- `GET /api/customers/:id/participants` - Get group participants
- `GET /api/customers/:id/settings` - Get group settings
- `POST /api/customers/:id/messages` - Send message
- `POST /api/customers/:id/poll` - Send poll
- `POST /api/customers/sync` - Sync groups and contacts
- `PATCH /api/customers/:id/messages/:messageId` - Edit message
- `PATCH /api/customers/:id/name` - Update group name
- `PATCH /api/customers/:id/settings` - Update group settings
- `POST /api/customers/:id/participants` - Add participants
- `DELETE /api/customers/:id/participants` - Remove participants
- `POST /api/groups/create` - Create group
- `POST /api/groups/add-members` - Add members with tracking
- `POST /api/groups/join-url` - Generate join URL
- `GET /api/groups/:groupId/failed-attempts` - Get failed attempts
- `GET /api/groups/:groupId/join-urls` - Get join URLs
- `POST /api/diagnostics/check-number` - Check phone number
- `GET /api/whatsapp/messages/:chatId` - Fetch historical messages

**Not guarded (always available regardless of WhatsApp connection):**
- `GET /api/status` - Always responds (returns `ready: false` when disconnected)
- `GET /api/health` - Always responds (no auth required)
- `GET /api/settings` - Get server settings
- `PATCH /api/settings` - Update server settings
- `GET /api/groups/join/:token` - Public join URL handler (has its own internal 503 handling)
- `DELETE /api/customers/:id` - Delete customer from local database
- `DELETE /api/customers/:id/messages/:messageId` - Delete a message (calls WhatsApp but has no connection guard; may fail with 500 if disconnected)

### Group-Only Guard (`requireGroupCustomer`)

The following endpoints are restricted to group customers only (type `group`). If called with a contact customer ID (type `contact`), they return 400 `NOT_A_GROUP` immediately:

- `GET /api/customers/:id/participants` - Get group participants
- `GET /api/customers/:id/settings` - Get group settings
- `PATCH /api/customers/:id/settings` - Update group settings
- `PATCH /api/customers/:id/name` - Update group name
- `POST /api/customers/:id/participants` - Add participants
- `DELETE /api/customers/:id/participants` - Remove participants
- `POST /api/customers/:id/poll` - Send poll

These endpoints work for **both** groups and contacts (no group guard):
- `GET /api/customers/:id/messages` - Get messages
- `POST /api/customers/:id/messages` - Send message
- `PATCH /api/customers/:id/messages/:messageId` - Edit message
- `DELETE /api/customers/:id/messages/:messageId` - Delete message
- `GET /api/whatsapp/messages/:chatId` - Fetch historical messages

### How to handle 503

1. Check `GET /api/status` to confirm the server is disconnected
2. The server connection is managed internally - clients do not initiate it
3. Display an appropriate "server offline" message to your users
4. Retry the request after a delay (see [Retry Strategy](#retry-strategy))

---

## Quick Start

### Step 1: Check Server Status

```http
GET /api/status
```

**Response (Server Ready):**
```json
{
  "ready": true
}
```

**Response (Server Not Ready):**
```json
{
  "ready": false,
  "message": "Server is not connected to WhatsApp"
}
```

### Step 2: Get Customers (Groups & Contacts)

```http
GET /api/customers
```

### Step 3: Get Messages (Local Database)

```http
GET /api/customers/{customerId}/messages?limit=20
```

### Step 4: Fetch Historical Messages (From WhatsApp)

```http
GET /api/whatsapp/messages/{chatId}?limit=200
```

Use this to build conversation context or sync messages not yet in the local database.

### Step 5: Connect WebSocket for Real-Time Updates

```
wss://YOUR_SERVER_URL/ws?apiKey=YOUR_API_KEY
```

---

## API Endpoints

### Server Status

#### GET /api/status

Check if the server is ready to serve requests.

**Response (Ready):**
```json
{
  "ready": true
}
```

**Response (Not Ready):**
```json
{
  "ready": false,
  "message": "Server is not connected to WhatsApp"
}
```

**Usage:**
- Call this endpoint on client startup to verify the server is available
- If `ready` is `false`, display an appropriate message to users and retry periodically

---

### Customers (Groups & Contacts)

Customers represent WhatsApp chats synced to the server. Each customer has a `type` field:
- `group` — A WhatsApp group chat (ID ends in `@g.us`)
- `contact` — An individual 1-on-1 chat (ID ends in `@c.us`)

#### GET /api/customers

Get all customers (synced WhatsApp groups and contacts).

**Response:**
```json
[
  {
    "id": "120363123456789@g.us",
    "type": "group",
    "name": "Sales Team",
    "description": "Group for sales discussions",
    "participantCount": 12,
    "phoneNumber": null,
    "lastMessage": "Meeting at 3pm",
    "lastMessageTime": "2025-01-29T10:30:00Z",
    "unreadCount": 5,
    "isAdmin": true
  },
  {
    "id": "1234567890@c.us",
    "type": "contact",
    "name": "John Doe",
    "description": null,
    "participantCount": 0,
    "phoneNumber": "1234567890",
    "lastMessage": "Thanks for the update",
    "lastMessageTime": "2025-01-29T11:00:00Z",
    "unreadCount": 2,
    "isAdmin": false
  }
]
```

**Customer Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | WhatsApp chat ID (`@g.us` for groups, `@c.us` for contacts) |
| `type` | string | `"group"` or `"contact"` |
| `name` | string | Group name or contact display name |
| `description` | string \| null | Group description (null for contacts) |
| `participantCount` | number | Number of participants (0 for contacts) |
| `phoneNumber` | string \| null | Phone number (only for contacts, null for groups) |
| `lastMessage` | string \| null | Last message text |
| `lastMessageTime` | string \| null | ISO timestamp of last message |
| `unreadCount` | number | Number of unread messages |
| `isAdmin` | boolean | Whether the server account is admin (always false for contacts) |

---

#### GET /api/customers/:id

Get a single customer by ID.

**Response (Group):**
```json
{
  "id": "120363123456789@g.us",
  "type": "group",
  "name": "Sales Team",
  "description": "Group for sales discussions",
  "participantCount": 12,
  "phoneNumber": null,
  "lastMessage": "Meeting at 3pm",
  "lastMessageTime": "2025-01-29T10:30:00Z",
  "unreadCount": 5,
  "isAdmin": true
}
```

**Response (Contact):**
```json
{
  "id": "1234567890@c.us",
  "type": "contact",
  "name": "John Doe",
  "description": null,
  "participantCount": 0,
  "phoneNumber": "1234567890",
  "lastMessage": "Thanks for the update",
  "lastMessageTime": "2025-01-29T11:00:00Z",
  "unreadCount": 2,
  "isAdmin": false
}
```

---

#### DELETE /api/customers/:id

Remove a customer from the local database. Does not leave the WhatsApp group.

**Response:**
```json
{
  "success": true
}
```

---

#### POST /api/customers/sync

Sync all WhatsApp chats (groups and individual contacts) as customers. Imports all groups where the server account is a member and all individual contacts with chat history.

**Response:**
```json
{
  "success": true,
  "message": "Synced 12 customers (groups and contacts) from WhatsApp",
  "count": 12
}
```

---

### Server Settings

#### GET /api/settings

Get current server settings.

**Response:**
```json
{
  "id": 1,
  "historyDepth": 100,
  "updatedAt": "2026-02-17T10:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `historyDepth` | number | Default number of messages imported per chat when fetching historical messages via `GET /api/whatsapp/messages/:chatId` |

---

#### PATCH /api/settings

Update server settings.

**Request Body:**
```json
{
  "historyDepth": 500
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `historyDepth` | number | No | Default message fetch depth (must be between 1 and 10000) |

**Response:**
```json
{
  "id": 1,
  "historyDepth": 500,
  "updatedAt": "2026-02-17T10:05:00Z"
}
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `historyDepth must be a number between 1 and 10000` | Invalid value for historyDepth |

---

### Messages

Messaging endpoints work for **both** group and contact customers.

#### GET /api/customers/:id/messages

Get message history for a customer (group or contact) from local database.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 100 | Maximum number of messages to return |

**Response:**
```json
[
  {
    "id": "true_120363123456789@g.us_ABC123",
    "customerId": "120363123456789@g.us",
    "body": "Hello everyone!",
    "fromPhone": "+1234567890",
    "fromName": "John Doe",
    "timestamp": "2025-01-29T10:30:00Z",
    "isFromMe": false,
    "hasMedia": false,
    "messageType": "text"
  }
]
```

---

#### GET /api/whatsapp/messages/:chatId

Fetch historical messages directly from WhatsApp servers. Use this endpoint to build conversation context or sync historical messages that aren't in the local database.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chatId` | string | WhatsApp chat ID (e.g., `120363123456789@g.us` for groups, `1234567890@c.us` for individuals) |

**Query Parameters:**
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | number | Server's `historyDepth` setting (default 100) | 500 | Maximum number of messages to fetch |

**Response:**
```json
{
  "success": true,
  "chatId": "120363123456789@g.us",
  "count": 150,
  "messages": [
    {
      "id": "true_120363123456789@g.us_ABC123",
      "customerId": "120363123456789@g.us",
      "body": "Hello everyone!",
      "fromPhone": "1234567890@c.us",
      "fromName": "John Doe",
      "timestamp": "2025-01-28T10:30:00Z",
      "isFromMe": false,
      "hasMedia": false,
      "messageType": "text"
    },
    {
      "id": "true_120363123456789@g.us_DEF456",
      "customerId": "120363123456789@g.us",
      "body": "Good morning!",
      "fromPhone": "0987654321@c.us",
      "fromName": "Jane Smith",
      "timestamp": "2025-01-28T10:31:00Z",
      "isFromMe": false,
      "hasMedia": false,
      "messageType": "text"
    }
  ]
}
```

**Notes:**
- Messages are sorted oldest-first (ascending by timestamp)
- Fetched messages are also saved to the local database for caching
- This endpoint retrieves messages from WhatsApp servers, not just locally stored ones
- Useful for building AI context or initial sync when connecting to existing groups
- May take longer than the local endpoint due to network requests
- The default limit is controlled by the server's `historyDepth` setting

**Message Types:**
| Type | Description |
|------|-------------|
| `text` | Plain text message |
| `image` | Image message |
| `video` | Video message |
| `audio` | Audio/voice message |
| `document` | Document/file attachment |
| `sticker` | Sticker message |
| `poll` | Poll message |

---

#### POST /api/customers/:id/messages

Send a message to a customer (group or contact). Supports both text-only messages and messages with file attachments.

**Option 1: Text-Only Message (JSON)**

Send a plain text message using JSON body:

**Request Body:**
```json
{
  "message": "Hello from the API!"
}
```

> **Field Name Warning:** The text field is `message`, not `text` or `body`. Using wrong field names will be silently ignored.

**Response:**
```json
{
  "success": true,
  "message": {
    "id": "true_120363123456789@g.us_XYZ789",
    "customerId": "120363123456789@g.us",
    "body": "Hello from the API!",
    "isFromMe": true,
    "hasMedia": false,
    "messageType": "text",
    "timestamp": "2025-01-29T10:35:00Z"
  }
}
```

**Option 2: Message with Attachment (Multipart Form Data)**

Send a message with a file attachment using `multipart/form-data`:

**Form Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Any file to attach (images, videos, audio, documents, or any other file type) |
| `caption` | string | No | Optional caption/message text to accompany the attachment |

**File Size Limit:** 100MB maximum for all file types.

**Message Type Detection:**
The API automatically determines the message type based on the file's MIME type:
- `image/*` → `image`
- `video/*` → `video`
- `audio/*` → `audio`
- `image/webp` → `sticker`
- All other types → `document`

**Example Request (using fetch):**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('caption', 'Check out this document!');

const response = await fetch('/api/customers/120363123456789@g.us/messages', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key'
  },
  body: formData
});
```

**Example Request (using curl):**
```bash
curl -X POST "http://localhost:5000/api/customers/120363123456789@g.us/messages" \
  -H "X-API-Key: your-api-key" \
  -F "file=@/path/to/image.jpg" \
  -F "caption=Here's the photo you requested"
```

**Response (with attachment):**
```json
{
  "success": true,
  "message": {
    "id": "true_120363123456789@g.us_ABC123",
    "customerId": "120363123456789@g.us",
    "body": "Here's the photo you requested",
    "isFromMe": true,
    "hasMedia": true,
    "messageType": "image",
    "fileName": "image.jpg",
    "mimeType": "image/jpeg",
    "timestamp": "2025-01-29T10:35:00Z"
  }
}
```

**Error Responses:**

File too large:
```json
{
  "error": "File too large"
}
```

No file provided (multipart request without file):
```json
{
  "error": "No file provided. Use JSON body with 'message' field for text-only messages, or include a 'file' field for attachments"
}
```

---

#### PATCH /api/customers/:id/messages/:messageId

Edit a previously sent text message in a WhatsApp chat (group or contact). This uses WhatsApp's native message editing feature, so recipients will see the updated message with an "edited" indicator.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Customer (group) ID (e.g., `120363123456789@g.us`) |
| `messageId` | string | The WhatsApp message ID to edit (e.g., `true_120363123456789@g.us_XYZ789`) |

**Request Body:**
```json
{
  "message": "Updated message text"
}
```

**Request Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | The new message text to replace the original |

> **Field Name Warning:** The text field is `message`, not `text` or `body`. Using wrong field names will be silently ignored.

**Response:**
```json
{
  "success": true,
  "message": {
    "id": "true_120363123456789@g.us_XYZ789",
    "customerId": "120363123456789@g.us",
    "body": "Updated message text",
    "fromPhone": "1234567890@c.us",
    "fromName": "Me",
    "isFromMe": true,
    "hasMedia": false,
    "messageType": "text",
    "timestamp": "2025-01-29T10:35:00Z"
  }
}
```

**Example Request (curl):**
```bash
curl -X PATCH "http://localhost:5000/api/customers/120363123456789@g.us/messages/true_120363123456789@g.us_XYZ789" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"message": "Updated message text"}'
```

**Example Request (fetch):**
```javascript
const response = await fetch(
  '/api/customers/120363123456789@g.us/messages/true_120363123456789@g.us_XYZ789',
  {
    method: 'PATCH',
    headers: {
      'X-API-Key': 'your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: 'Updated message text' })
  }
);
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `message is required` | Request body missing the `message` field or it is empty |
| 403 | `FORBIDDEN` | Cannot edit this message — it was not sent by the connected WhatsApp account (`isFromMe` must be true) |
| 404 | `Message not found` | No message with the given `messageId` exists in the local database |
| 404 | `Customer not found` | No customer with the given `id` exists |
| 422 | `Only text messages can be edited` | The target message is a media, poll, or sticker message — only plain text messages support editing |
| 422 | `Edit window expired` | WhatsApp's edit time window (approximately 15 minutes after sending) has passed |
| 503 | `SERVICE_UNAVAILABLE` | Server is not connected to WhatsApp |

**Constraints & Notes:**
- Only messages sent by the connected WhatsApp account can be edited (i.e., `isFromMe` must be `true`).
- Only text messages can be edited. Media, poll, and sticker messages cannot be edited.
- WhatsApp enforces an edit time window of approximately 15 minutes after the message was originally sent. After this window closes, edits will fail. This is enforced by WhatsApp, not by this server.
- The local database is updated with the new message body upon a successful edit.
- Group members will see the updated message with a small "edited" label applied by WhatsApp.

---

#### DELETE /api/customers/:id/messages/:messageId

Delete a previously sent message from a WhatsApp chat (group or contact). This uses WhatsApp's "delete for everyone" feature, so the message will be removed for all recipients and replaced with a "This message was deleted" notice.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Customer (group) ID (e.g., `120363123456789@g.us`) |
| `messageId` | string | The WhatsApp message ID to delete (e.g., `true_120363123456789@g.us_XYZ789`) |

**Response:**
```json
{
  "success": true,
  "messageId": "true_120363123456789@g.us_XYZ789"
}
```

**Example Request (curl):**
```bash
curl -X DELETE "http://localhost:5000/api/customers/120363123456789@g.us/messages/true_120363123456789@g.us_XYZ789" \
  -H "X-API-Key: your-api-key"
```

**Example Request (fetch):**
```javascript
const response = await fetch(
  '/api/customers/120363123456789@g.us/messages/true_120363123456789@g.us_XYZ789',
  {
    method: 'DELETE',
    headers: {
      'X-API-Key': 'your-api-key'
    }
  }
);
```

**Error Responses:**

| Status | Error | Description |
|--------|-------|-------------|
| 403 | `FORBIDDEN` | Cannot delete this message — it was not sent by the connected WhatsApp account (`isFromMe` must be true) |
| 404 | `Message not found` | No message with the given `messageId` exists for the specified customer |
| 404 | `Customer not found` | No customer with the given `id` exists |
| 503 | `SERVICE_UNAVAILABLE` | Server is not connected to WhatsApp |

**Constraints & Notes:**
- Only messages sent by the connected WhatsApp account can be deleted (i.e., `isFromMe` must be `true`).
- This performs a "delete for everyone" action. All group members will see a "This message was deleted" notice in place of the original message.
- The message record is removed from the local database upon successful deletion.
- Any message type (text, media, poll, etc.) can be deleted — unlike editing, deletion is not limited to text messages.

---

### Polls (Group Only)

#### POST /api/customers/:id/poll

Send a poll to a customer (WhatsApp group). Polls allow group members to vote on options. **This endpoint is only available for group customers.** Returns 400 `NOT_A_GROUP` if called with a contact customer ID.

**Request Body:**
```json
{
  "question": "What time works best for our meeting?",
  "options": ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"],
  "allowMultipleAnswers": false
}
```

**Request Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | Yes | The poll question (max 255 characters) |
| `options` | string[] | Yes | Array of poll options (2-12 options, each max 100 characters) |
| `allowMultipleAnswers` | boolean | No | Whether voters can select multiple options (default: `false`) |

**Response:**
```json
{
  "success": true,
  "message": {
    "id": "true_120363123456789@g.us_POLL123",
    "customerId": "120363123456789@g.us",
    "body": "[Poll] What time works best for our meeting?",
    "isFromMe": true,
    "hasMedia": false,
    "messageType": "poll",
    "pollQuestion": "What time works best for our meeting?",
    "pollOptions": ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"],
    "allowMultipleAnswers": false,
    "timestamp": "2026-02-05T10:35:00Z"
  }
}
```

**Error Responses:**

Invalid options count:
```json
{
  "error": "Polls must have between 2 and 12 options"
}
```
HTTP Status: 400 Bad Request

Missing question:
```json
{
  "error": "Poll question is required"
}
```
HTTP Status: 400 Bad Request

Option too long:
```json
{
  "error": "Poll options must be 100 characters or less"
}
```
HTTP Status: 400 Bad Request

**Example Request (using curl):**
```bash
curl -X POST "http://localhost:5000/api/customers/120363123456789@g.us/poll" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What time works best for our meeting?",
    "options": ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"],
    "allowMultipleAnswers": false
  }'
```

**Example Request (using JavaScript):**
```javascript
const response = await fetch('/api/customers/120363123456789@g.us/poll', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    question: 'What time works best for our meeting?',
    options: ['9:00 AM', '11:00 AM', '2:00 PM', '4:00 PM'],
    allowMultipleAnswers: false
  })
});
```

**Example Request (using Python):**
```python
import requests

response = requests.post(
    'http://localhost:5000/api/customers/120363123456789@g.us/poll',
    headers={'X-API-Key': 'your-api-key'},
    json={
        'question': 'What time works best for our meeting?',
        'options': ['9:00 AM', '11:00 AM', '2:00 PM', '4:00 PM'],
        'allowMultipleAnswers': False
    }
)
```

---

### Groups

#### POST /api/groups/create

Create a new WhatsApp group with participants. Optionally set a group icon/profile picture.

> **Field Name Warning:** The file field for the group profile picture is `icon`, not `photo` or `image`. Using the wrong field name will be silently ignored.

**Option 1: JSON Body (no icon)**

```json
{
  "name": "New Project Team",
  "participants": ["+1234567890", "+0987654321"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Group name (min 1 character) |
| `participants` | string[] | Yes | Phone numbers with country code (min 1) |
| `settings` | object | No | Group permission settings (see below) |

**Settings fields (all optional, all boolean):**

| Field | Type | Default | `true` means | `false` means |
|-------|------|---------|-------------|--------------|
| `membersCanEditSettings` | `boolean` | WhatsApp default | Members can edit group name, icon, description | Only admins can edit |
| `membersCanSendMessages` | `boolean` | WhatsApp default | Members can send messages | Only admins can send |
| `membersCanAddMembers` | `boolean` | WhatsApp default | Members can add others | Only admins can add |

> **Field Name Warning:** Use the full camelCase names: `membersCanEditSettings`, `membersCanSendMessages`, `membersCanAddMembers`. Do NOT use shortened names like `sendMessages`, `addMembers`, or `editSettings` — they will be silently ignored.

**Option 2: Multipart Form Data (with optional icon)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Group name |
| `participants` | string | Yes | JSON array of phone numbers (e.g., `["+1234567890", "+0987654321"]`) or comma-separated list |
| `settings` | string | No | JSON object with group settings |
| `icon` | File | No | Image file for group profile picture (must be image/* MIME type, JPEG/PNG recommended) |

**Example Request (with icon using curl):**
```bash
curl -X POST "http://localhost:5000/api/groups/create" \
  -H "X-API-Key: your-api-key" \
  -F "name=New Project Team" \
  -F "participants=[\"+1234567890\", \"+0987654321\"]" \
  -F "icon=@/path/to/group-image.jpg"
```

**Example Request (with icon using fetch):**
```javascript
const formData = new FormData();
formData.append('name', 'New Project Team');
formData.append('participants', JSON.stringify(['+1234567890', '+0987654321']));
formData.append('icon', iconFile); // File object

const response = await fetch('/api/groups/create', {
  method: 'POST',
  headers: { 'X-API-Key': 'your-api-key' },
  body: formData
});
```

**Response (Success):**
```json
{
  "success": true,
  "groupId": "120363123456789@g.us",
  "groupName": "New Project Team",
  "results": {
    "added": [
      { "number": "1234567890", "whatsappId": "1234567890@c.us" },
      { "number": "0987654321", "whatsappId": "0987654321@c.us" }
    ],
    "failed": []
  },
  "summary": {
    "totalRequested": 2,
    "successfullyAdded": 2,
    "failedToAdd": 0
  },
  "customer": {
    "id": "120363123456789@g.us",
    "name": "New Project Team",
    "participantCount": 3
  },
  "iconSet": true
}
```

**Icon Field Behavior:**
- `iconSet: true` - Icon was successfully set
- `iconSet: false` - No icon was provided, or icon setting failed
- `iconError: "..."` - Present only when icon setting failed, contains the error reason

**Note:** If a non-image file is provided as `icon`, the group is still created successfully but `iconSet` will be `false` and `iconError` will explain why.

**Response (Partial Success):**
```json
{
  "success": true,
  "groupId": "120363123456789@g.us",
  "groupName": "New Project Team",
  "results": {
    "added": [
      { "number": "1234567890", "whatsappId": "1234567890@c.us" }
    ],
    "failed": [
      {
        "number": "0987654321",
        "reason": "The phone number is not registered on WhatsApp",
        "statusCode": 404
      }
    ]
  },
  "summary": {
    "totalRequested": 2,
    "successfullyAdded": 1,
    "failedToAdd": 1
  }
}
```

**Failure Status Codes:**
| Code | Meaning |
|------|---------|
| 403 | Privacy settings prevent adding to groups |
| 404 | Phone number not registered on WhatsApp |
| 408 | Request timed out |
| 409 | Already in group |

---

#### POST /api/diagnostics/check-number

Check if a phone number is registered on WhatsApp.

**Request Body:**
```json
{
  "phoneNumber": "+1234567890"
}
```

**Response:**
```json
{
  "isRegistered": true,
  "whatsappId": "1234567890@c.us"
}
```

---

### Group Management (Group Only)

These endpoints allow clients to manage existing WhatsApp groups. **All endpoints in this section are only available for group customers.** They return 400 `NOT_A_GROUP` if called with a contact customer ID.

#### PATCH /api/customers/:id/name

Update a group's name.

**Request Body:**
```json
{
  "name": "New Group Name"
}
```

**Example Request:**
```bash
curl -X PATCH "http://localhost:5000/api/customers/120363123456789@g.us/name" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Team Name"}'
```

**Response:**
```json
{
  "success": true,
  "name": "Updated Team Name",
  "customer": {
    "id": "120363123456789@g.us",
    "name": "Updated Team Name",
    "participantCount": 5
  }
}
```

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | - | Name is required and must be a non-empty string |
| 403 | FORBIDDEN | Not authorized - admin privileges required |
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp |

---

#### POST /api/customers/:id/participants

Add participants to a group.

**Request Body:**
```json
{
  "participants": ["+1234567890", "+0987654321"]
}
```

> **Field Name Warning:** The field is `participants`, not `members`. Using `members` will be silently ignored.

**Example Request:**
```bash
curl -X POST "http://localhost:5000/api/customers/120363123456789@g.us/participants" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"participants": ["+1234567890", "+0987654321"]}'
```

**Response:**
```json
{
  "success": true,
  "added": [
    { "number": "1234567890", "whatsappId": "1234567890@c.us" }
  ],
  "failed": [
    { "number": "0987654321", "whatsappId": "0987654321@c.us", "reason": "Not authorized to add this participant" }
  ],
  "summary": {
    "totalRequested": 2,
    "successfullyAdded": 1,
    "failedToAdd": 1
  },
  "customer": {
    "id": "120363123456789@g.us",
    "name": "Team Name",
    "participantCount": 6
  }
}
```

**Common Failure Reasons:**
| Code | Reason |
|------|--------|
| 403 | Not authorized to add this participant (privacy settings) |
| 409 | Participant already in group |

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | - | participants is required and must be a non-empty array |
| 403 | FORBIDDEN | Not authorized - admin privileges required |
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp |

---

#### DELETE /api/customers/:id/participants

Remove participants from a group.

**Request Body:**
```json
{
  "participants": ["+1234567890", "+0987654321"]
}
```

**Example Request:**
```bash
curl -X DELETE "http://localhost:5000/api/customers/120363123456789@g.us/participants" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"participants": ["+1234567890"]}'
```

**Response:**
```json
{
  "success": true,
  "removed": [
    { "number": "1234567890", "whatsappId": "1234567890@c.us" }
  ],
  "failed": [],
  "summary": {
    "totalRequested": 1,
    "successfullyRemoved": 1,
    "failedToRemove": 0
  },
  "customer": {
    "id": "120363123456789@g.us",
    "name": "Team Name",
    "participantCount": 4
  }
}
```

**Common Failure Reasons:**
| Code | Reason |
|------|--------|
| 403 | Not authorized to remove this participant |
| 404 | Participant not in group |

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | - | participants is required and must be a non-empty array |
| 403 | FORBIDDEN | Not authorized - admin privileges required |
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp |

---

#### GET /api/customers/:id/settings

Get group privacy/permission settings. Settings are cached in the database and automatically updated when changes are detected.

> **Field Name Warning:** Settings use the full camelCase names: `membersCanEditSettings`, `membersCanSendMessages`, `membersCanAddMembers`. Do NOT use shortened names like `sendMessages`, `addMembers`, or `editSettings`.

**Example Request:**
```bash
curl "http://localhost:5000/api/customers/120363123456789@g.us/settings" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Response:**
```json
{
  "membersCanEditSettings": true,
  "membersCanSendMessages": true,
  "membersCanAddMembers": true,
  "lastUpdated": "2026-02-05T02:30:00.000Z",
  "source": "api"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `membersCanEditSettings` | boolean | Whether non-admin members can edit group info |
| `membersCanSendMessages` | boolean | Whether non-admin members can send messages |
| `membersCanAddMembers` | boolean | Whether non-admin members can add new participants |
| `lastUpdated` | string | ISO timestamp of when the settings were last updated/cached |
| `source` | string | How settings were obtained: `"api"` (via API) or `"event"` (via WhatsApp event) |

**Note:** Settings are automatically cached when groups are created, updated via the API, or when external changes are detected via WhatsApp events.

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | NOT_A_GROUP | The specified chat is not a group |
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp and no cached settings exist |

---

#### PATCH /api/customers/:id/settings

Update group privacy/permission settings. You must be a group admin.

**Request Body:**
```json
{
  "membersCanEditSettings": false,
  "membersCanSendMessages": true,
  "membersCanAddMembers": false
}
```

All fields are optional. Only include the settings you want to change.

> **Field Name Warning:** Use the full camelCase names: `membersCanEditSettings`, `membersCanSendMessages`, `membersCanAddMembers`. Do NOT use shortened names like `sendMessages`, `addMembers`, or `editSettings` — they will be silently ignored.

| Setting | Description |
|---------|-------------|
| `membersCanEditSettings` | Whether non-admin members can edit group info |
| `membersCanSendMessages` | Whether non-admin members can send messages |
| `membersCanAddMembers` | Whether non-admin members can add new participants |

**Example Request:**
```bash
curl -X PATCH "http://localhost:5000/api/customers/120363123456789@g.us/settings" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"membersCanSendMessages": false}'
```

**Response:**
The response returns the current group settings after the update, fetched directly from WhatsApp for accuracy.
```json
{
  "membersCanEditSettings": false,
  "membersCanSendMessages": false,
  "membersCanAddMembers": true,
  "lastUpdated": "2026-02-05T02:35:00.000Z",
  "source": "api"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `membersCanEditSettings` | boolean | Current state of edit settings permission |
| `membersCanSendMessages` | boolean | Current state of send messages permission |
| `membersCanAddMembers` | boolean | Current state of add members permission |
| `lastUpdated` | string | ISO timestamp of when the settings were updated |
| `source` | string | Always `"api"` for updates made via this endpoint |

**Note:** The response reflects the final state of all settings (not just the ones you changed), fetched from WhatsApp after applying your changes.

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | NOT_A_GROUP | The specified chat is not a group |
| 403 | FORBIDDEN | Not authorized - admin privileges required |
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp |

---

### Failed Member Handling & Join URLs

These endpoints enable handling of users who couldn't be added to groups due to privacy settings or not being on WhatsApp. You can track failed attempts and generate shareable join URLs for re-invitation.

#### POST /api/groups/add-members

Add members to a group with automatic failure tracking. Failed attempts are logged with categorized reasons.

**Request Body:**
```json
{
  "groupId": "120363123456789@g.us",
  "members": ["+1234567890", "+0987654321", "+1122334455"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `groupId` | string | Yes | WhatsApp group ID |
| `members` | string[] | Yes | Array of phone numbers to add |

**Example Request:**
```bash
curl -X POST "http://localhost:5000/api/groups/add-members" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "120363123456789@g.us",
    "members": ["+1234567890", "+0987654321"]
  }'
```

**Response:**
```json
{
  "successfulMembers": ["+1234567890"],
  "failedMembers": [
    {
      "userId": "+0987654321",
      "reason": "privacy_settings"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `successfulMembers` | string[] | Phone numbers successfully added |
| `failedMembers` | object[] | Array of failed additions with reasons |
| `failedMembers[].userId` | string | Phone number that failed |
| `failedMembers[].reason` | string | Failure reason (see table below) |

**Failure Reasons:**
| Reason | Description |
|--------|-------------|
| `not_on_whatsapp` | Phone number is not registered on WhatsApp |
| `privacy_settings` | User's privacy settings prevent being added to groups |
| `blocked` | User has blocked the server account |
| `unknown` | Unknown reason for failure |

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | - | Invalid request body |
| 403 | FORBIDDEN | Not authorized - admin privileges required |
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp |

---

#### POST /api/groups/join-url

Generate a shareable join URL for a user who couldn't be added to a group. The URL can be sent to the user via other channels (SMS, email, etc.).

**Request Body:**
```json
{
  "userId": "+0987654321",
  "groupId": "120363123456789@g.us"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | Phone number of the user |
| `groupId` | string | Yes | WhatsApp group ID |

**Example Request:**
```bash
curl -X POST "http://localhost:5000/api/groups/join-url" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "+0987654321",
    "groupId": "120363123456789@g.us"
  }'
```

**Response:**
```json
{
  "url": "https://your-server.com/api/groups/join/a1b2c3d4e5f6...",
  "token": "a1b2c3d4e5f6...",
  "expiresAt": "2026-02-12T10:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Full URL to share with the user |
| `token` | string | Unique secure token (64 characters) |
| `expiresAt` | string | ISO timestamp when the link expires (7 days from creation) |

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | - | Invalid request body |
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp |

---

#### GET /api/groups/join/:token

**Public endpoint - No API key required.**

Verify and process a join request. When a user clicks the join URL, this endpoint validates the token and attempts to add them to the group.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | The unique token from the join URL |

**Example URL:**
```
https://your-server.com/api/groups/join/a1b2c3d4e5f6...
```

**Response (Success):**
```json
{
  "status": "success",
  "message": "Successfully joined the group",
  "groupId": "120363123456789@g.us",
  "groupName": "Sales Team"
}
```

**Response (Already Used):**
```json
{
  "status": "already_used",
  "message": "This join link has already been used"
}
```
HTTP Status: 410 Gone

**Response (Expired):**
```json
{
  "status": "expired",
  "message": "This join link has expired"
}
```
HTTP Status: 410 Gone

**Response (Invalid Token):**
```json
{
  "status": "invalid",
  "message": "Join link not found or invalid"
}
```
HTTP Status: 404 Not Found

**Response (Server Not Connected):**
```json
{
  "status": "error",
  "message": "Server is not connected to WhatsApp. Please try again later."
}
```
HTTP Status: 503 Service Unavailable

**Response (Join Failed):**
```json
{
  "status": "error",
  "message": "Unable to add you to the group. Your privacy settings may not allow being added to groups."
}
```
HTTP Status: 400 Bad Request

---

#### GET /api/groups/:groupId/failed-attempts

Get all failed member addition attempts for a group.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `groupId` | string | WhatsApp group ID |

**Example Request:**
```bash
curl "http://localhost:5000/api/groups/120363123456789@g.us/failed-attempts" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Response:**
```json
{
  "failedAttempts": [
    {
      "id": 1,
      "userId": "+0987654321",
      "groupId": "120363123456789@g.us",
      "reason": "privacy_settings",
      "createdAt": "2026-02-05T10:30:00.000Z"
    },
    {
      "id": 2,
      "userId": "+1122334455",
      "groupId": "120363123456789@g.us",
      "reason": "not_on_whatsapp",
      "createdAt": "2026-02-05T10:30:00.000Z"
    }
  ]
}
```

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp |

---

#### GET /api/groups/:groupId/join-urls

Get all generated join URLs for a group, including their status.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `groupId` | string | WhatsApp group ID |

**Example Request:**
```bash
curl "http://localhost:5000/api/groups/120363123456789@g.us/join-urls" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Response:**
```json
{
  "joinUrls": [
    {
      "id": 1,
      "token": "a1b2c3d4e5f6...",
      "userId": "+0987654321",
      "groupId": "120363123456789@g.us",
      "status": "pending",
      "expiresAt": "2026-02-12T10:30:00.000Z",
      "usedAt": null,
      "createdAt": "2026-02-05T10:30:00.000Z",
      "fullUrl": "https://your-server.com/api/groups/join/a1b2c3d4e5f6..."
    },
    {
      "id": 2,
      "token": "x7y8z9...",
      "userId": "+1122334455",
      "groupId": "120363123456789@g.us",
      "status": "used",
      "expiresAt": "2026-02-12T11:00:00.000Z",
      "usedAt": "2026-02-06T09:15:00.000Z",
      "createdAt": "2026-02-05T11:00:00.000Z",
      "fullUrl": "https://your-server.com/api/groups/join/x7y8z9..."
    }
  ]
}
```

**Join URL Status:**
| Status | Description |
|--------|-------------|
| `pending` | Link is active and can be used |
| `used` | Link has been successfully used to join the group |
| `expired` | Link has passed its expiration date |

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 404 | GROUP_NOT_FOUND | Group not found |
| 503 | SERVICE_UNAVAILABLE | Server is not connected to WhatsApp |

---

### Health Check

#### GET /api/health

Basic server health check. **Does not require authentication.**

**Response:**
```json
{
  "status": "ok",
  "whatsapp": "ready",
  "websocket": {
    "clients": 2
  }
}
```

---

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
    "voter": "1234567890@c.us",
    "voterName": "John Doe",
    "selectedOptions": ["9:00 AM", "2:00 PM"],
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

## Error Handling

### Standard Error Response

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

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (invalid input) |
| 401 | Unauthorized (missing API key) |
| 403 | Forbidden (invalid API key or insufficient privileges) |
| 404 | Resource not found |
| 410 | Gone (join URL already used or expired) |
| 422 | Unprocessable entity (validation error, edit window expired, all participants failed) |
| 500 | Server error |
| 503 | Service unavailable (server not connected to WhatsApp) |

### Complete Error Code Reference

| HTTP Status | Error Code | When it occurs | Action to take |
|-------------|------------|----------------|----------------|
| 400 | (validation errors) | Invalid request body (missing fields, wrong types) | Fix the request payload |
| 400 | `NOT_A_GROUP` | Endpoint requires a group chat but the customer is a contact (individual chat). Applies to group management endpoints (participants, settings, name, poll). | Use a group customer ID (ending in `@g.us`) |
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

## Field Quick Reference

> Exact field names, types, and structures expected by the server for client-facing endpoints.
> Any field not listed here will be silently ignored.
> Admin endpoints (`/api/admin/*`) and the public join URL endpoint (`/api/groups/join/:token`) are not covered here.

### Customer Types

Every customer has a `type` field:

| Type | Description | ID format |
|------|-------------|-----------|
| `group` | WhatsApp group chat | `...@g.us` |
| `contact` | Individual 1-on-1 chat | `...@c.us` |

Group-only endpoints will return `400 NOT_A_GROUP` if called with a contact ID.

### Group-Only vs. Both Types

| Endpoint | Groups | Contacts |
|----------|--------|----------|
| Send/receive messages | Yes | Yes |
| Edit/delete messages | Yes | Yes |
| Fetch message history | Yes | Yes |
| Get/update settings | Yes | No (400) |
| Get participants | Yes | No (400) |
| Add/remove participants | Yes | No (400) |
| Update group name | Yes | No (400) |
| Send polls | Yes | No (400) |

### Common Field Name Mistakes

| Wrong (will be ignored) | Correct |
|------------------------|---------|
| `sendMessages` | `membersCanSendMessages` |
| `addMembers` | `membersCanAddMembers` |
| `editSettings` | `membersCanEditSettings` |
| `photo` (base64) | `icon` (file upload) |
| `text` or `body` | `message` |
| `members` (in participant endpoints) | `participants` |
| `phoneNumber` (in check endpoint) | `phoneNumber` (correct) |

---

## Endpoint Speed Tiers

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
| `/api/settings` | GET | Get server settings | No |
| `/api/settings` | PATCH | Update server settings | No |
| `DELETE /api/customers/:id` | DELETE | Remove customer from local database | No |

**Client timeout:** 5 seconds is more than sufficient.

**Note:** The `historyDepth` server setting (managed via `/api/settings`) controls the default number of messages fetched per chat when calling `GET /api/whatsapp/messages/:chatId`.

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
| `/api/customers/sync` | POST | Sync all WhatsApp groups and contacts | 5-45 seconds (depends on chat count) |
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

## Client-Side Timeout Recommendations

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

## Payload Restrictions

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
| Time window | ~15 minutes after original send time (enforced by WhatsApp, not by this server) |

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
| Default limit | Controlled by `historyDepth` server setting (default 100), max 500 |

### Join URLs

| Constraint | Value |
|-----------|-------|
| Token length | 64 characters (hex) |
| Expiration | 7 days from creation |
| Single use | Each token can only be used once |

---

## Rate Limits & WhatsApp Restrictions

The server does not enforce rate limits itself, but WhatsApp does. Exceeding these recommendations risks your account being flagged or temporarily blocked by WhatsApp.

| Operation | Recommended limit | Risk if exceeded |
|-----------|-------------------|-----------------|
| Messages per group | Max 1 message per second | Temporary message block |
| Group creation | Max 1 group per minute | Account restriction |
| Participant additions | Space out by 1-2 seconds per participant | Privacy/spam flags |
| Number lookups | Max 1 per second | Temporary lookup block |
| Chat sync (groups + contacts) | Max once every 5 minutes | Excessive API calls |
| API calls | No server-side limits | Use reasonably |

### WhatsApp Account-Level Restrictions

- New WhatsApp accounts have stricter rate limits
- Sending too many messages to non-contacts may trigger spam detection
- Creating many groups in a short period can result in a temporary ban
- Adding users who frequently block or report the account increases risk

---

## Retry Strategy

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

## Known Limitations

1. **External WhatsApp API may return incomplete participant data.** The server calculates participant counts locally to compensate.

2. **Promotion to admin may silently fail** for participants with certain privacy settings. The response will indicate success, but the participant may not actually be promoted.

3. **Profile pictures are not available for all participants** due to WhatsApp privacy settings. The `profilePicUrl` field may be `null`.

4. **Group creation includes a 2-second internal wait** after creating the group to allow participants to fully join before verifying the member list. This is intentional and contributes to the endpoint's response time.

5. **Message edit window is approximate.** WhatsApp enforces a ~15 minute edit window, but the exact cutoff is determined by WhatsApp's servers, not by this API.

6. **The server manages one WhatsApp session.** All API requests share a single WhatsApp connection. Heavy concurrent usage of action endpoints may cause contention.

7. **Historical message fetch saves to local database.** Calling `GET /api/whatsapp/messages/:chatId` also caches the messages locally. Subsequent calls to `GET /api/customers/:id/messages` will include these messages.

---

## Curl Test Checklist

Use these commands to verify the API is working correctly. Replace `YOUR_SERVER` and `YOUR_API_KEY` with actual values.

### Test 1: Server Status (should respond in < 1 second)

```bash
curl --max-time 5 -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  "https://YOUR_SERVER/api/status" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Expected:** `{"ready":true}` with HTTP 200, under 1 second.

---

### Test 2: Health Check (should respond in < 1 second, no auth)

```bash
curl --max-time 5 -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  "https://YOUR_SERVER/api/health"
```

**Expected:** `{"status":"ok","whatsapp":"ready",...}` with HTTP 200, under 1 second.

---

### Test 3: Check Phone Number (should respond in < 15 seconds)

```bash
curl --max-time 30 -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -X POST "https://YOUR_SERVER/api/diagnostics/check-number" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+13472449450"}'
```

**Expected:** `{"isRegistered":true,"whatsappId":"13472449450@c.us"}` or `{"isRegistered":false}` with HTTP 200, under 15 seconds.

---

### Test 4: Create Group (should respond in < 30 seconds)

```bash
curl --max-time 60 -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -X POST "https://YOUR_SERVER/api/groups/create" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "#Chuku", "participants": ["13472449450"]}'
```

**Expected:** HTTP 200 with `success: true`, group details, and participant results. Under 30 seconds.

---

### Test 5: Invalid Payload (should respond in < 1 second with 400)

```bash
curl --max-time 5 -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -X POST "https://YOUR_SERVER/api/groups/create" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** HTTP 400 with validation errors, under 1 second. This confirms that input validation happens before any WhatsApp calls.

---

### Test 6: Missing API Key (should respond in < 1 second with 401)

```bash
curl --max-time 5 -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -X GET "https://YOUR_SERVER/api/customers"
```

**Expected:** HTTP 401 with `{"error":"Missing API key. Include X-API-Key header."}`, under 1 second.

---

### Test 7: Wrong API Key (should respond in < 1 second with 403)

```bash
curl --max-time 5 -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -X GET "https://YOUR_SERVER/api/customers" \
  -H "X-API-Key: wrong-key-here"
```

**Expected:** HTTP 403 with `{"error":"Invalid API key"}`, under 1 second.

---

### Response Time Targets Summary

| Endpoint category | Target | Hard limit (never exceed) |
|-------------------|--------|--------------------------|
| Status / Health | < 1 second | 5 seconds |
| Input validation errors (400) | < 1 second | 5 seconds |
| Auth errors (401/403) | < 1 second | 5 seconds |
| Connection guard (503) | < 1 second | 5 seconds |
| Diagnostics / check-number | < 15 seconds | 30 seconds |
| Group create | < 30 seconds | 60 seconds |
| Send message | < 10 seconds | 30 seconds |
| Sync groups + contacts | < 30 seconds | 60 seconds |

**Golden rule:** If any action endpoint has not responded within 60 seconds, something is wrong. Abort the request and investigate.

---

## Code Examples

### JavaScript/Node.js

```javascript
const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://YOUR_SERVER_URL';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json'
};

async function checkServerStatus() {
  const response = await fetch(`${BASE_URL}/api/status`, { headers });
  const data = await response.json();
  
  if (!data.ready) {
    console.log('Server not ready:', data.message);
    return false;
  }
  
  console.log('Server is ready');
  return true;
}

async function getCustomers() {
  const response = await fetch(`${BASE_URL}/api/customers`, { headers });
  
  if (response.status === 503) {
    throw new Error('Server not connected to WhatsApp');
  }
  
  return response.json();
}

async function getMessages(customerId, limit = 20) {
  const response = await fetch(
    `${BASE_URL}/api/customers/${customerId}/messages?limit=${limit}`,
    { headers }
  );
  return response.json();
}

async function fetchHistoricalMessages(chatId, limit = 200) {
  const response = await fetch(
    `${BASE_URL}/api/whatsapp/messages/${chatId}?limit=${limit}`,
    { headers }
  );
  return response.json();
}

async function sendMessage(customerId, message) {
  const response = await fetch(
    `${BASE_URL}/api/customers/${customerId}/messages`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ message })
    }
  );
  return response.json();
}

// WebSocket connection
const ws = new WebSocket(`wss://YOUR_SERVER_URL/ws?apiKey=${API_KEY}`);

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  
  switch (type) {
    case 'connected':
      console.log('WebSocket connected');
      break;
    case 'message':
      console.log('New message:', data.body);
      break;
    case 'service_unavailable':
      console.log('Server disconnected from WhatsApp');
      break;
  }
};
```

### Python

```python
import requests
import websocket
import json

API_KEY = 'YOUR_API_KEY'
BASE_URL = 'https://YOUR_SERVER_URL'
HEADERS = {'X-API-Key': API_KEY}

def check_server_status():
    response = requests.get(f'{BASE_URL}/api/status', headers=HEADERS)
    data = response.json()
    
    if not data.get('ready'):
        print(f"Server not ready: {data.get('message')}")
        return False
    
    print("Server is ready")
    return True

def get_customers():
    response = requests.get(f'{BASE_URL}/api/customers', headers=HEADERS)
    
    if response.status_code == 503:
        raise Exception('Server not connected to WhatsApp')
    
    return response.json()

def get_messages(customer_id, limit=20):
    response = requests.get(
        f'{BASE_URL}/api/customers/{customer_id}/messages',
        headers=HEADERS,
        params={'limit': limit}
    )
    return response.json()

def fetch_historical_messages(chat_id, limit=200):
    response = requests.get(
        f'{BASE_URL}/api/whatsapp/messages/{chat_id}',
        headers=HEADERS,
        params={'limit': limit}
    )
    return response.json()

def send_message(customer_id, message):
    response = requests.post(
        f'{BASE_URL}/api/customers/{customer_id}/messages',
        headers={**HEADERS, 'Content-Type': 'application/json'},
        json={'message': message}
    )
    return response.json()

# WebSocket
def on_message(ws, message):
    data = json.loads(message)
    msg_type = data.get('type')
    
    if msg_type == 'connected':
        print('WebSocket connected')
    elif msg_type == 'message':
        print(f"New message: {data['data']['body']}")
    elif msg_type == 'service_unavailable':
        print('Server disconnected from WhatsApp')

ws = websocket.WebSocketApp(
    f"wss://YOUR_SERVER_URL/ws?apiKey={API_KEY}",
    on_message=on_message
)
ws.run_forever()
```

### cURL

```bash
# Check server status
curl https://YOUR_SERVER_URL/api/status \
  -H "X-API-Key: YOUR_API_KEY"

# Get all customers
curl https://YOUR_SERVER_URL/api/customers \
  -H "X-API-Key: YOUR_API_KEY"

# Get messages (from local database)
curl "https://YOUR_SERVER_URL/api/customers/120363123456789@g.us/messages?limit=20" \
  -H "X-API-Key: YOUR_API_KEY"

# Fetch historical messages (from WhatsApp servers)
curl "https://YOUR_SERVER_URL/api/whatsapp/messages/120363123456789@g.us?limit=200" \
  -H "X-API-Key: YOUR_API_KEY"

# Send a message
curl -X POST https://YOUR_SERVER_URL/api/customers/120363123456789@g.us/messages \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from the API!"}'

# Sync customers
curl -X POST https://YOUR_SERVER_URL/api/customers/sync \
  -H "X-API-Key: YOUR_API_KEY"
```

---

## Phone Number Format

| Context | Format | Examples |
|---------|--------|----------|
| Input (requests) | With or without `+` prefix | `+1234567890` or `1234567890` |
| Output (responses) | Digits only, no `+` | `1234567890` |
| WhatsApp IDs (responses) | Full format with suffix | Individual: `1234567890@c.us`, Group: `120363123456789@g.us` |
