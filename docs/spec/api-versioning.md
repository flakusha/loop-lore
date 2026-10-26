<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# API Versioning Strategy

Status: In Progress (see `.plan/epics/epic-api-versioning.md`). Phase 0 done (`meta.api_version` in responses); Phase 1 shipped: `versionResolver()` + `v1Routes` mounted in `src/elysia-app.ts` (~L199-254), with `/api/{resource}` → `/api/v1/{resource}` redirect (already-versioned and `/api/views/*` excluded to avoid double-prefix loops).

## Implemented

- Scheme: `/api/v1/{resource}` now; `/api/v2/` on first breaking change; unversioned legacy paths redirect to v1.
- Version resolution from URL path (`/api/v1/...`), `ctx.apiVersion` populated for plugins via global derive.
- A request that names a version this server does not serve — path `/api/vN/...` or `Accept: application/vnd.loop-lore.vN+json` — is rejected with a 400 JSON error envelope naming the supported versions. The gate lives in the `versionResolver()` plugin (`unsupportedVersionResponse()` in `src/routes/middleware/version-resolver.ts`), so every app that mounts the middleware answers it before the request reaches a route — no `/api/v1/v2/...` double-prefix redirect is emitted for it.
- Rules: additive changes stay in current version; breaking changes create a new version; deprecated versions carry `Sunset`/`Deprecation`/`Link` headers; removal after N-1.
- Envelope: `{ data, meta: { api_version, deprecated? } }`; paginated adds `pagination`.
- Exception — infra/probe surfaces stay unversioned and must answer directly (never 308): `GET /api/health` (`docs/ops/bare-metal-deploy.md` §10.2 requires `200`; `deploy/docker-compose.yml` polls it), opt-in `GET /health/live` / `GET /health/ready`, opt-in `GET /metrics`, and `/api/views/*`. `healthRoutes` therefore defaults to the `/api` prefix in `src/app/register-plugins.ts`, while the v1 barrel mounts the same factory with `/api/v1` so `/api/v1/health` also exists; `src/routes/v1/v1-enforcement.test.ts` pins the no-redirect behavior.
- DB is version-agnostic — `content_version` columns (migration 018) track content format, not API version.

## Not implemented / aspirational

- v2 routes, `src/routes/v2/`, plugin-manifest per-version route registration, Accept-header (`application/vnd.loop-lore.vN+json`) content negotiation fallback (the header is only used to reject an unsupported version today — it never selects a version).
- Deprecation header emission (no v2 exists yet).

## Epics

- `.plan/epics/epic-api-versioning.md`

## See also

`docs/spec/api-routes.md`, `docs/spec/error-envelope.md`, `src/elysia-app.ts`.
