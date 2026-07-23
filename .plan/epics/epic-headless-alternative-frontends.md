# EPIC: Headless Mode & Alternative Frontends

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic

## Summary

Headless mode, alternative frontend solutions, OpenAPI spec, WebSocket/WebTransport support. Enable non-browser clients and alternative UIs.

## Scope

- Headless API mode (no frontend serving)
- OpenAPI spec generation
- WebSocket/WebTransport support
- Alternative frontend framework support
- API-first architecture

## Tasks

- [ ] OpenAPI spec generation from Elysia routes
- [ ] Headless mode configuration
- [ ] WebSocket endpoint support
- [ ] WebTransport endpoint support
- [ ] API versioning strategy
- [ ] Alternative frontend documentation

## Fresh.js Implementation (Deno-native)

Fresh.js is the first concrete alternative frontend — Deno-native, islands
architecture, zero client JS by default. Serves as proof-of-concept for
the API-first architecture.

### Architecture

- **Islands**: Server-rendered HTML, islands upgrade to interactive
  Fresh components consume `/api/*` endpoints
- **No build step**: Deploy via `deno deploy` or static export
- **TailwindCSS**: Style islands with utility classes
- **HTMX passthrough**: Islands can delegate to backend SSE/WS

### Implementation Tasks

- [ ] Generate OpenAPI spec from Elysia (`src/routes/swagger.ts`)
- [ ] Create Fresh.js starter repo (`loop-lore-fresh-starter/`)
- [ ] Implement Fresh handlers for core endpoints (chat, characters, worlds)
- [ ] Add Fresh islands: message-list, chat-input, character-card
- [ ] Configure TailwindCSS for Fresh (`tailwind.config.js`)
- [ ] Add npm/yarn bridge for shared component library
- [ ] Document framework-agnostic API contract

### Deployment Targets

- **Deno Deploy**: `deployctl deploy --watch`
- **Docker**: Fresh static export + reverse proxy
- **Static**: Fresh preact-only export for CDN hosting

## Files

- `src/elysia-app.ts` — app configuration
- `src/routes/` — API routes
- `docs/spec/api-routes.md` — API documentation
- `docs/spec/architecture.md` — architecture spec

## Linked Tasks

- TASK-headless-alternative-frontends.md
