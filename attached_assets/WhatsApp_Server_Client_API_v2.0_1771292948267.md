# WhatsApp Server -- Client API Documentation

## Version 2.0 (Chat-Based Model)

Generated on: 2026-02-17T01:46:41.978944 UTC

------------------------------------------------------------------------

# 1. Overview

This API provides programmatic access to a WhatsApp Server instance.

Each server maintains a persistent connection to a single WhatsApp
identity. Clients authenticate using an API key and interact with
WhatsApp through a unified **Chat-based abstraction**.

Primary Entity: **Chat**

There is no concept of "customer" in this API.

------------------------------------------------------------------------

# 2. Base URL

    https://YOUR_SERVER_URL

WebSocket:

    wss://YOUR_SERVER_URL/ws?apiKey=YOUR_API_KEY

------------------------------------------------------------------------

# 3. Authentication

All `/api/*` endpoints require:

Header:

    X-API-Key: YOUR_API_KEY

Errors:

  Status   Meaning
  -------- ----------------------
  401      Missing API key
  403      Invalid API key
  500      Server misconfigured

Public endpoints: - GET /api/health - GET /api/groups/join/:token

------------------------------------------------------------------------

# 4. Server Status

## GET /api/status

Returns readiness state.

``` json
{
  "ready": true
}
```

If disconnected:

``` json
{
  "ready": false,
  "message": "Server is not connected to WhatsApp"
}
```

------------------------------------------------------------------------

# 5. Chats

A Chat represents a WhatsApp conversation.

Chat Types:

  Type     Description
  -------- ---------------------
  group    WhatsApp group chat
  direct   1-on-1 conversation

Chat ID formats:

-   group → xxxxx@g.us
-   direct → xxxxx@c.us

------------------------------------------------------------------------

## GET /api/chats

List all synced chats.

------------------------------------------------------------------------

## GET /api/chats/:chatId

Get a single chat.

------------------------------------------------------------------------

## DELETE /api/chats/:chatId

Delete chat from local database only (does NOT leave WhatsApp group).

------------------------------------------------------------------------

## POST /api/chats/sync

Sync all WhatsApp chats (groups and direct).

Typical duration: 5--45 seconds.

------------------------------------------------------------------------

# 6. Messages

Works for both group and direct chats.

------------------------------------------------------------------------

## GET /api/chats/:chatId/messages

Query parameter:

    ?limit=100

Returns messages from local database.

------------------------------------------------------------------------

## GET /api/whatsapp/messages/:chatId

Fetch historical messages directly from WhatsApp.

Limit max: 500.

------------------------------------------------------------------------

## POST /api/chats/:chatId/messages

### Text Message (JSON)

``` json
{
  "message": "Hello from API"
}
```

### File Upload (Multipart)

Fields:

  Field     Required
  --------- ----------
  file      Yes
  caption   No

Max file size: 100MB.

------------------------------------------------------------------------

## PATCH /api/chats/:chatId/messages/:messageId

Edit message.

Constraints: - Only text messages - Must be sent by the connected
account - WhatsApp edit window ≈ 15 minutes

------------------------------------------------------------------------

## DELETE /api/chats/:chatId/messages/:messageId

Delete message for everyone.

Works for all message types.

------------------------------------------------------------------------

# 7. Group-Only Capabilities

The following endpoints require chat.type = "group".

If called with a direct chat, the server returns:

    400 NOT_A_GROUP

Group-only endpoints:

GET /api/chats/:chatId/participants\
POST /api/chats/:chatId/participants\
DELETE /api/chats/:chatId/participants\
PATCH /api/chats/:chatId/name\
POST /api/chats/:chatId/poll\
POST /api/groups/create

------------------------------------------------------------------------

# 8. Error Handling

Common error responses:

  Status   Error
  -------- ----------------------------
  400      NOT_A\_GROUP
  401      Missing API key
  403      Invalid API key
  403      FORBIDDEN (admin required)
  404      Chat not found
  422      Validation error
  503      SERVICE_UNAVAILABLE

If 503 occurs, call `/api/status` and retry with exponential backoff.

------------------------------------------------------------------------

# 9. Timeout Recommendations

  Category                 Timeout
  ------------------------ ---------
  Local reads              5s
  Single WhatsApp action   30s
  Multi-step action        60--90s

Clients MUST set timeouts.

------------------------------------------------------------------------

# 10. Behavioral Differences: Group vs Direct

  Capability       Group   Direct
  ---------------- ------- --------
  Send message     ✅      ✅
  Edit message     ✅      ✅
  Delete message   ✅      ✅
  Participants     ✅      ❌
  Polls            ✅      ❌
  Join URLs        ✅      ❌
  Admin roles      ✅      ❌

Clients must branch logic using:

``` json
{
  "type": "group" | "direct"
}
```

------------------------------------------------------------------------

End of Client API Documentation (v2.0)
