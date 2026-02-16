# ImagineAgent Client

## Overview
A React + TypeScript + Vite frontend client for ImagineAgent. Provides settings, messaging, and group management interfaces for a WhatsApp server.

## Project Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Entry Point**: `src/main.tsx`
- **Main Component**: `src/App.tsx` — handles screen navigation
- **Custom Vite Plugin**: Generic API proxy in `vite.config.ts` for all `/api/*` routes

## Screens
- **SettingsScreen** (`src/SettingsScreen.tsx`): Configure server URL and API key, test connection
- **MessagingScreen** (`src/MessagingScreen.tsx`): Chat list sidebar + message thread view + actions menu
- **CreateGroupScreen** (`src/CreateGroupScreen.tsx`): Form to create a WhatsApp group with a selected contact

## API Layer
- **`src/api.ts`**: Typed API service with proxy fallback for CORS. Endpoints:
  - `GET /api/chats` — list all chats
  - `GET /api/chats/:id/messages` — messages for a chat
  - `POST /api/send-message` — send a message
  - `POST /api/group/create` — create a group
  - `GET /api/status` — server status check

## Development
- Dev server: `npm run dev` (runs on port 5000, host 0.0.0.0)
- Build: `npm run build`
- Lint: `npm run lint`

## Deployment
- Static deployment using `dist` directory after `npm run build`

## Recent Changes
- 2026-02-16: Added messaging screen with chat list, message thread, actions menu, and create group flow
- 2026-02-16: Extended Vite proxy to forward all /api/* routes (not just /api/status)
- 2026-02-16: Created API service layer (src/api.ts) with typed functions
- 2026-02-13: Initial Replit setup — configured Vite for port 5000 with allowedHosts
