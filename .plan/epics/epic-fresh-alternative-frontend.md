<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Fresh.js Alternative Frontend

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** fresh, deno, frontend, islands, tailwind, deployment
**Parent Epic:** Headless Mode & Alternative Frontends (epic-headless-alternative-frontends.md)

## Summary

Fresh.js is the first concrete alternative frontend — Deno-native, islands architecture, zero client JS by default. Serves as proof-of-concept for the API-first architecture.

## Architecture

- **Islands**: Server-rendered HTML, islands upgrade to interactive.
  Fresh components consume `/api/*` endpoints.
- **No build step**: Deploy via `deno deploy` or static export.
- **TailwindCSS**: Style islands with utility classes.
- **HTMX passthrough**: Islands can delegate to backend SSE/WS.

## Scope

- Fresh starter repository (`loop-lore-fresh-starter/`)
- Core-endpoint handlers (chat, characters, worlds)
- Islands: message-list, chat-input, character-card
- TailwindCSS configuration
- npm/yarn bridge for the shared component library
- Deployment targets: Deno Deploy, Docker, static export

## Tasks

- [ ] Create Fresh.js starter repo (`loop-lore-fresh-starter/`)
- [ ] Implement Fresh handlers for core endpoints (chat, characters, worlds)
- [ ] Add Fresh islands: message-list, chat-input, character-card
- [ ] Configure TailwindCSS for Fresh (`tailwind.config.js`)
- [ ] Add npm/yarn bridge for shared component library
- [ ] Document framework-agnostic API contract
- [ ] Support deployment targets: Deno Deploy (`deployctl deploy --watch`), Docker (Fresh static export + reverse proxy), static Preact-only export for CDN hosting

### Deployment Targets

- **Deno Deploy**: `deployctl deploy --watch`
- **Docker**: Fresh static export + reverse proxy
- **Static**: Fresh preact-only export for CDN hosting


- [ ] Alternative frontend documentation

## Dependencies

- **Parent hub:** Headless Mode & Alternative Frontends (`epic-headless-alternative-frontends.md`)
- **Requires:** `epic-api-first-foundation.md` — Fresh consumes the documented,
  versioned `/api/*` surface (the former "generate OpenAPI spec" task lives there).
- **Uses:** `epic-shared-client-sdk.md` — the npm/yarn bridge pulls
  `@loop-lore/api-types` / `@loop-lore/client` / design tokens into the Deno app.
- Runs in parallel with `epic-framework-sdks.md`.

## Related Epics

- `epic-deno-support.md` — Deno runtime compatibility work
- `epic-deployment-topologies.md` / `epic-deployment-infrastructure.md` — deployment context
