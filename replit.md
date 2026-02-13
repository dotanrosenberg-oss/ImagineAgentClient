# ImagineAgent Client

## Overview
A React + TypeScript + Vite frontend client for ImagineAgent. Provides a settings interface for connecting to a WhatsApp server via URL and API key.

## Project Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Entry Point**: `src/main.tsx`
- **Main Component**: `src/App.tsx`
- **Custom Vite Plugin**: WhatsApp status proxy in `vite.config.ts`

## Development
- Dev server: `npm run dev` (runs on port 5000, host 0.0.0.0)
- Build: `npm run build`
- Lint: `npm run lint`

## Deployment
- Static deployment using `dist` directory after `npm run build`

## Recent Changes
- 2026-02-13: Initial Replit setup — configured Vite for port 5000 with allowedHosts
