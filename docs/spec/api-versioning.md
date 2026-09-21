<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# API Versioning Strategy

Status: In Progress (see `.plan/epics/epic-api-versioning.md`). Phase 0 done (`meta.api_version` in responses); Phase 1 shipped: `versionResolver()` + `v1Routes` mounted in `src/elysia-app.ts` (~L199-254), with `/api/{resource}` → `/api/v1/{resource}` redirect (already-versioned and `/api/views/*` excluded to avoid double-prefix loops).

## Implemented

- Scheme: `/api/v1/{resource}` now; `/api/v2/` on first breaking change; unversioned legacy paths redirect to v1.
- Version resolution from URL path (`/api/v1/...`), `ctx.apiVersion` populated for plugins via global derive.
- Rules: additive changes stay in current version; breaking changes create a new version; deprecated versions carry `Sunset`/`Deprecation`/`Link` headers; removal after N-1.
- Envelope: `{ data, meta: { api_version, deprecated? } }`; paginated adds `pagination`.
- DB is version-agnostic — `data_version` columns (migration 018) track content format, not API version.

## Not implemented / aspirational

- v2 routes, `src/routes/v2/`, plugin-manifest per-version route registration, Accept-header (`application/vnd.loop-lore.vN+json`) content negotiation fallback.
- Deprecation header emission (no v2 exists yet).

## Epics

- `.plan/epics/epic-api-versioning.md`

## See also

`docs/spec/api-routes.md`, `docs/spec/error-envelope.md`, `src/elysia-app.ts`.
