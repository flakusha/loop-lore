<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: API-First Foundation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** api, openapi, headless, versioning, cors, authentication
**Parent Epic:** Headless Mode & Alternative Frontends (epic-headless-alternative-frontends.md)

## Summary

The API-first groundwork every alternative frontend and SDK depends on: OpenAPI spec generation from Elysia routes, headless mode configuration, API versioning, CORS and API-key authentication middleware, and an importable `packages/server/` Elysia app with documented endpoints.

## Scope

- OpenAPI spec generation from Elysia routes (`/api/openapi.json`)
- Headless mode configuration (skip frontend middleware)
- API versioning strategy (`/api/v1/`, `/api/v2/`)
- CORS middleware for external origins
- API key authentication middleware
- Importable server package (`packages/server/`)
- API endpoint documentation (`docs/api/`)

## Design Notes

- **Spec source of truth:** the OpenAPI document is generated from the Elysia route
  definitions — never hand-maintained. Downstream generators (`@loop-lore/api-types`,
  see `epic-shared-client-sdk.md`) consume `/api/openapi.json` directly, keeping types
  and docs in sync with the actual routes.
- **Headless mode:** a config switch that skips frontend-serving middleware so the
  process exposes only the API surface (useful for server deployments and non-browser
  clients).
- **Versioning:** URL-prefix strategy (`/api/v1/`, `/api/v2/`) so alternative frontends
  pin a contract while the core evolves.
- **Auth:** API key authentication middleware protects external-origin access;
  complements session auth used by the bundled frontend (see `epic-auth-access.md`,
  `epic-byok-api-keys.md`).
- **Importable app:** `packages/server/` exports the configured Elysia app so embedders
  mount loop-lore's API inside their own server.

## Tasks

- [ ] Generate OpenAPI spec from Elysia routes (`/api/openapi.json`)
- [ ] Add headless mode config (skip frontend middleware)
- [ ] Implement API versioning (`/api/v1/`, `/api/v2/`)
- [ ] Add CORS middleware for external origins
- [ ] Add API key authentication middleware
- [ ] Create `packages/server/` with importable Elysia app
- [ ] Document API endpoints in `docs/api/`

## Dependencies

- **Parent hub:** Headless Mode & Alternative Frontends (`epic-headless-alternative-frontends.md`)
- **Blocks:** `epic-shared-client-sdk.md` (generates types from the spec),
  `epic-framework-sdks.md` and `epic-fresh-alternative-frontend.md` (both consume the
  documented API surface). First slice — nothing else in the hub starts before this lands.

## Related Epics

- `epic-api-routes.md` — route inventory the spec generator walks
- `epic-api-versioning.md` — versioning strategy detail
- `epic-error-envelope.md` — structured error responses surfaced in the spec
- `epic-auth-access.md` / `epic-byok-api-keys.md` — auth/key management context
