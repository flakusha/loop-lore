# Application Architecture

## Overview

loop-lore is a lightweight roleplay/chat application reimagining SillyTavern with modern tooling. The architecture prioritizes minimal local setup, easy distributed deployment, and data integrity.

## Guiding Principles

1. **Minimum-build** — Zero or minimal compilation step for local dev. Bun runs TS directly.
2. **Data integrity first** — Messages survive crashes, disconnects, machine failure.
3. **Progressive disclosure** — Simple for solo users, scalable for multi-user setups.
4. **Adapter pattern** — DB, auth, frontend layers swappable without core changes.
5. **Dual-mode architecture** — RPG and agentic workspace modes share 80%+ of the codebase (schema, services, UI components). See [Use Case: Agentic Assistant Workspace](./use-case-agentic-workspace.md).

## System Layers

```
┌─────────────────────────────┐
│      Clients                │
│  Web (htmx+Alpine)  TUI     │
│  (blessed)   API (REST)     │
└──────────────┬──────────────┘
               │ HTTP / WS
┌──────────────▼──────────────┐
│   Bun HTTP Server           │
│   Static serving            │
│   Route dispatch            │
│   Session middleware        │
└──────────────┬──────────────┘
┌──────────────▼──────────────┐
│   Service Layer             │
│  Assistant  Gallery  Chat   │
│  Character  User/Session    │
└──────────────┬──────────────┘
┌──────────────▼──────────────┐
│   DB Adapter Layer          │
│  SQLite  (Postgres/MySQL)   │
└─────────────────────────────┘
```

### Client Layer

- **Web**: htmx for AJAX partial updates, Alpine.js for client state/interactivity. HTML prebuilt and pre-compressed where possible.
- **TUI**: blessed/blessed-contrib terminal interface for power users.
- **API**: REST endpoints consumed by any client (web, TUI, curl, scripts).

### Server Layer

Bun's built-in HTTP server handles routing, static file serving, session management, and request lifecycle. No Express/Koa dependency.

### Service Layer

Domain logic isolated in service modules. Each service depends only on the DB adapter interface, not concrete implementations.

### Data Layer

Abstracted through `DatabaseAdapter` interface. Default: SQLite (zero-config). Swappable to Postgres/MySQL for multi-user production.

## Request Flow (Web)

```
1. Browser requests page → Bun serves prebuilt HTML from disk
2. User action → htmx sends AJAX to /api/*
3. Route handler → calls service → calls DB adapter
4. Response (HTML fragment or JSON) → htmx swaps DOM
5. Alpine.js manages local UI state (modals, forms, toasts)
```

## Static Asset Serving

- Prebuilt HTML templates stored in `src/views/` or `dist/public/`
- Pre-compressed (gzip/brotli) variants served when available
- Bun handles `If-None-Match` / `If-Modified-Since` for caching
- Assets built via a `build` script before deployment; in dev, served directly

## Documentation Serving

- `/docs/*` routes serve Markdown from `docs/` directory
- Controlled by config/docs flag:
  - `DOCS_ENABLED=false` → docs routes return 404
  - Individual doc sections can be hidden via config (e.g., internal architecture docs hidden from public)
- VitePress or similar SSG optional for rich docs; plain Markdown is default

## Multi-Process/Session Architecture

- Single Bun process handles all clients in local/solo mode
- For multi-user: reverse proxy (nginx/caddy) + multiple Bun workers or container instances
- Session state stored in DB (not in-memory) for crash resilience
- WebSocket connections for real-time updates (future)
