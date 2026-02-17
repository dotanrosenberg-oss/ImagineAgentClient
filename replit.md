# ImagineAgent Client

## Overview
A React + TypeScript + Vite frontend client for ImagineAgent. Provides WhatsApp status display, messaging, and group management interfaces connected to a WhatsApp server API.

## Project Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Entry Point**: `src/main.tsx`
- **Main Component**: `src/App.tsx` — handles screen navigation

## Screens
- **MessagingScreen** (`src/MessagingScreen.tsx`): Status bar + chat list sidebar (groups & direct chats) + message thread view + sync/create group actions
- **CreateGroupScreen** (`src/CreateGroupScreen.tsx`): Form to create a WhatsApp group with phone number participants

## API Layer
- **`src/api.ts`**: Typed API service with v2/v1 endpoint fallback and timeout support per tier. Primary entity: **Chat** (replaces old "Customer" concept). Endpoints:
  - `GET /api/chats` (fallback: `/api/customers`) — list all synced chats
  - `GET /api/chats/:chatId` — get a single chat
  - `DELETE /api/chats/:chatId` — delete chat from local DB
  - `POST /api/chats/sync` (fallback: `/api/customers/sync`) — sync chats from WhatsApp
  - `GET /api/chats/:chatId/messages?limit=N` — messages from local DB
  - `POST /api/chats/:chatId/messages` — send a message
  - `PATCH /api/chats/:chatId/messages/:messageId` — edit a message
  - `DELETE /api/chats/:chatId/messages/:messageId` — delete a message
  - `GET /api/whatsapp/messages/:chatId?limit=N` — backfill history from WhatsApp
  - `POST /api/groups/create` — create a WhatsApp group
  - `POST /api/diagnostics/check-number` — check if phone is on WhatsApp
  - `GET /api/status` — server readiness check
  - `GET /api/health` — detailed health (WhatsApp status, phone, name)

- **`src/websocket.ts`**: WebSocket client for real-time updates. Events:
  - `message` — new incoming message
  - `chat_update` — chat data changed
  - `chats_synced` — sync completed
  - `service_unavailable` — WhatsApp disconnected

## Chat Types
- `group` — WhatsApp group chat (ID format: `xxxxx@g.us`)
- `contact` / `direct` — 1-on-1 conversation (ID format: `xxxxx@c.us`)
- UI shows different icons for group vs direct chats

## Proxy Configuration
- **`vite.config.ts`**: Vite proxy forwards `/api/*` and `/ws` to the WhatsApp server
  - API key injected server-side via `X-API-Key` header (from `WA_API_KEY` secret)
  - WebSocket proxy appends `apiKey` query parameter
  - Auto-detects swapped `WA_SERVER_URL`/`WA_API_KEY` values

## API Compatibility
- Client uses v2 endpoints (`/api/chats/*`) with automatic fallback to v1 (`/api/customers/*`)
- Content-type checking prevents HTML fallback responses from being treated as JSON
- Server currently uses `type: "contact"` (not `"direct"`) for 1-on-1 chats

## Secrets
- `WA_SERVER_URL` — WhatsApp server base URL
- `WA_API_KEY` — API key for authentication

## Development
- Dev server: `npm run dev` (runs on port 5000, host 0.0.0.0)
- Build: `npm run build`
- Lint: `npm run lint`

## Deployment
- Static deployment using `dist` directory after `npm run build`

## Recent Changes
- 2026-02-17: Added file attachment support (up to 100 MB) for both direct chats and groups
- 2026-02-17: Added group permission toggles (send messages, add members) to group creation
- 2026-02-17: Migrated to Chat-based API v2.0 model (Customer → Chat) with v1 fallback
- 2026-02-17: Added support for direct/contact chats alongside group chats
- 2026-02-17: Added new endpoints: edit message, delete message, delete chat
- 2026-02-17: Updated WebSocket events to chat-based naming (chat_update, chats_synced)
- 2026-02-17: Added chat type icons (single person for direct, multi-person for group)
- 2026-02-17: Rebuilt API layer to match actual server API with proper timeouts
- 2026-02-17: Added WebSocket service for real-time message updates
- 2026-02-17: Added status bar showing WhatsApp connection status and phone number
- 2026-02-16: Initial messaging screen with chat list and message thread
- 2026-02-13: Initial Replit setup
