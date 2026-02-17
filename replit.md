# ImagineAgent Client

## Overview
A React + TypeScript + Vite frontend client for ImagineAgent. Provides WhatsApp status display, messaging, and group management interfaces connected to a WhatsApp server API.

## Project Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Entry Point**: `src/main.tsx`
- **Main Component**: `src/App.tsx` — handles screen navigation

## Screens
- **MessagingScreen** (`src/MessagingScreen.tsx`): Status bar + chat list sidebar + message thread view + sync/create group actions
- **CreateGroupScreen** (`src/CreateGroupScreen.tsx`): Form to create a WhatsApp group with phone number participants

## API Layer
- **`src/api.ts`**: Typed API service with timeout support per endpoint tier. Endpoints:
  - `GET /api/status` — server readiness check
  - `GET /api/health` — detailed health (WhatsApp status, phone, name)
  - `GET /api/customers` — list all synced WhatsApp groups
  - `POST /api/customers/sync` — sync groups from WhatsApp (slow, 60s timeout)
  - `GET /api/customers/{id}/messages?limit=N` — messages from local DB
  - `GET /api/whatsapp/messages/{chatId}?limit=N` — backfill history from WhatsApp
  - `POST /api/customers/{id}/messages` — send a message
  - `POST /api/groups/create` — create a WhatsApp group
  - `POST /api/diagnostics/check-number` — check if phone is on WhatsApp
  - `GET /api/admin/sync-status` — group sync statistics

- **`src/websocket.ts`**: WebSocket client for real-time updates. Events:
  - `message` — new incoming message
  - `customer_update` — customer data changed
  - `customers_synced` — sync completed
  - `service_unavailable` — WhatsApp disconnected

## Proxy Configuration
- **`vite.config.ts`**: Vite proxy forwards `/api/*` and `/ws` to the WhatsApp server
  - API key injected server-side via `X-API-Key` header (from `WA_API_KEY` secret)
  - WebSocket proxy appends `apiKey` query parameter
  - Auto-detects swapped `WA_SERVER_URL`/`WA_API_KEY` values

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
- 2026-02-17: Rebuilt API layer to match actual server API (customers, messages, groups, health endpoints)
- 2026-02-17: Added WebSocket service for real-time message updates
- 2026-02-17: Added status bar showing WhatsApp connection status and phone number
- 2026-02-17: Added sync button to import WhatsApp groups
- 2026-02-17: Updated CreateGroupScreen to accept phone numbers directly
- 2026-02-17: Added proper request timeouts per API docs (5s/30s/60s tiers)
- 2026-02-16: Initial messaging screen with chat list and message thread
- 2026-02-13: Initial Replit setup
