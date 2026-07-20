> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Application Architecture

## Overview

loop-lore is a lightweight roleplay/chat application reimagining SillyTavern with modern tooling. The architecture prioritizes minimal local setup, easy distributed deployment, and data integrity.

## Guiding Principles

## System Layers

A request traverses four layers top-to-bottom:

**1. Client Layer** — Entry points for user interaction:

- Web UI (htmx + Alpine.js) — browser-based, AJAX partial updates
- TUI (blessed) — terminal interface for power users
- API (REST) — programmatic access via curl, scripts, integrations

**2. Server Layer** — Bun HTTP server receives client traffic:

- Serves static assets (HTML, CSS, JS) with pre-compressed variants
- Middleware pipeline processes every request in order: auth extraction → role guard → route dispatch
- Route handlers delegate to domain services

**3. Service Layer** — Domain logic isolated per concern:

- Assistant, Assets, Chat, Generation, Story, Content, Age Gate, Dice, Character, User/Session
- Each service depends on the DB adapter interface, never concrete implementations

**4. Data Layer** — Abstracted storage backend:

- Default: SQLite via `bun:sqlite` (zero-config, local solo use)
- Swappable: Postgres via Kysely dialect swap (multi-user production)

### Client Layer

- **Web**: htmx for AJAX partial updates, Alpine.js for client state/interactivity. HTML prebuilt and pre-compressed where possible.
- **TUI**: blessed/blessed-contrib terminal interface for power users.
- **API**: REST endpoints consumed by any client (web, TUI, curl, scripts).

### Server Layer

Bun's built-in HTTP server handles routing, static file serving, session management, and request lifecycle. No Express/Koa dependency.

Request lifecycle flows through a middleware pipeline before reaching route handlers:

1. **Auth middleware** — extracts Bearer token from `Authorization` header, hashes it, looks up session in DB, populates `RequestContext { userId, userRole, sessionId }`
2. **Role guard** — checks route permissions against user role (admin routes need admin role)
3. **Route dispatch** — delegates to domain controllers (age-gate, generation, etc.)

Middleware is defined in `src/middleware/` — see [`docs/implementation.md`](./implementation.md#middleware-pipeline).

### Service Layer

Domain logic isolated in service modules. Each service depends only on the DB adapter interface, not concrete implementations.

### Data Layer

Abstracted through `DatabaseAdapter` interface. Default: SQLite (zero-config). Swappable to Postgres for multi-user production.

## Request Flow (Web)

Seven-step journey for a typical web interaction:

## Static Asset Serving

- Prebuilt HTML templates stored in `src/views/` or `dist/public/`
- Pre-compressed (gzip/brotli) variants served when available
- Bun handles `If-None-Match` / `If-Modified-Since` for caching
- Assets built via a `build` script before deployment; in dev, served directly

## Documentation Serving

- `/docs/*` routes serve prebuilt HTML from `docs/.vitepress/dist/`
- Controlled by `docs` config block:
  - `docs.enabled: false` → all docs routes return 404
  - `docs.public: [list]` → allowlist of visible section prefixes. Example: `["guide", "frontend", "assets"]` restricts docs to user-facing content only. Empty or absent = all sections visible
- VitePress or similar SSG optional for rich docs; plain Markdown is default

## Multi-Process/Session Architecture

- Single Bun process handles all clients in local/solo mode
- For multi-user: reverse proxy (nginx/caddy) + multiple Bun workers or container instances
- Session state stored in DB (not in-memory) for crash resilience
- WebSocket connections for real-time updates (future)
