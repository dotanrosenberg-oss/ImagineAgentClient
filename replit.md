# ImagineAgent Client

## Overview
A React + TypeScript + Vite frontend client for ImagineAgent. Provides WhatsApp status display, messaging, and group management interfaces connected to a WhatsApp server API.

## Project Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Entry Point**: `src/main.tsx`
- **Main Component**: `src/App.tsx` — handles screen navigation

## Screens
- **MessagingScreen** (`src/MessagingScreen.tsx`): Status bar + chat list sidebar (groups & direct chats) + message thread view + sync/create group/settings actions
- **CreateGroupScreen** (`src/CreateGroupScreen.tsx`): Form to create a WhatsApp group with phone number participants
- **SettingsScreen** (`src/SettingsScreen.tsx`): Dedicated settings page with full CRUD for managing group actions (create, edit, delete). Accessible via gear icon in sidebar header

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

## Backend
- **`server/index.js`**: Express server on port 3001 providing CRUD API for actions stored in PostgreSQL
- **Database**: PostgreSQL `actions` table with columns: id, type (group/chat), name, description, api_url, api_key, api_doc_url, project_id, created_at, updated_at
- **Endpoints**:
  - `GET /local-api/actions/:type` — list actions by type
  - `POST /local-api/actions/:type` — create/update an action (upsert by id)
  - `DELETE /local-api/actions/:type/:id` — delete an action
  - `POST /local-api/actions/execute` — execute an action (proxies to external API server-side to avoid CORS)

## Deployment
- Autoscale deployment: builds with `npm run build`, runs Express backend + Vite preview

## Actions
- **`src/groupActions.ts`**: Data model and API client for actions (stored in PostgreSQL). Each action has: id, name, description, apiUrl (optional), apiKey, apiDocUrl, projectId
- **`src/SettingsScreen.tsx`**: Full CRUD UI for managing group and chat actions (create, edit, delete). Accessible via gear icon in sidebar header
- **Action Bar**: Actions appear as clickable chips at the top of the chat panel (below the header) — always visible when a chat is opened
  - Group chats show group actions, direct chats show chat actions
  - Actions without an API endpoint appear greyed out / disabled
  - Clicking a chip opens an inline invoke panel with optional note and message context selection
- **`src/GroupActionsPanel.tsx`** / **`src/ChatActionsPanel.tsx`**: Legacy panels (no longer used in main UI, replaced by inline ActionInvokeBar in MessagingScreen)
- Actions are stored in PostgreSQL database
- Backend proxies the call to the external API (TaskFlow format: title, projectId, description, status, priority) with Bearer token auth
- API response is displayed as an inline chat bubble (NOT sent to the group/chat) with success/error indicators
- Response bubble stays visible until manually closed by the user

## Recent Changes
- 2026-02-17: Redesigned actions UX — actions now appear as a chip bar at the top of every chat (group and direct), replacing the hidden "..." dropdown menu. Inline invoke panel with note + context selection
- 2026-02-17: Actions can now be created without API endpoints — shown as disabled/greyed out in action bar, with yellow left border indicator in Settings
- 2026-02-17: Action responses now displayed in client-side panel (not sent to group chat) with status indicators, spinner during execution, and full API response data
- 2026-02-17: Migrated action storage from localStorage to PostgreSQL database with Express backend API on port 3001
- 2026-02-17: Added Chat Actions for direct chats — configurable actions in Settings, execute-only panel in direct chat "..." menu. Replaced hardcoded "Create group with contact" button
- 2026-02-17: Moved Group Actions management to dedicated Settings screen (gear icon in sidebar). Actions are now global (available in all groups). Group chat panel simplified to execute-only
- 2026-02-17: Added Group Actions feature — configurable actions (Create Customer, Create Opportunity, Ask for Quote, etc.) with name, description, API URL, and API key
- 2026-02-17: Fixed chat image issue — file attachments now use proper multipart/form-data upload; media messages show clean type-specific placeholders (Photo, Video, Audio, Document) since server has no media download endpoint
- 2026-02-17: Fixed chat photos — colored initial-based avatars in chat list (with profile pic support when available), inline image/video display for media messages
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
