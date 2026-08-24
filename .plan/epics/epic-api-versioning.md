<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: API Versioning (v1/v2+)

**Status:** 🔧 In Progress
**Priority:** High
**Effort:** Medium
**Epic ID:** EPIC-2026-32
**Type:** Feature Epic
**Tags:** api, versioning, routes, compatibility, deprecation, openapi

## Overview

Introduce explicit API versioning (`/api/v1/`, `/api/v2/`) so breaking changes
never break existing clients. Today **no versioning exists**: all routes are
mounted unversioned under `/api/{resource}` (Elysia plugin prefix + a legacy
`handleApiRequest` catch-all). This epic reconciles that gap — documents the
current state, defines the versioning scheme, and drives the phased migration
to a versioned surface with graceful deprecation.

## Current State (verified 2026-08-12)

- `src/elysia-app.ts` mounts Elysia route plugins under unversioned prefixes
  (`/api/chats`, `/api/assets`, …); `app.all("/*")` delegates every other
  `/api/*` path to the legacy `handleApiRequest` in `src/server`.
- 30+ route files in `src/routes/` plus controllers in `src/*/controller.ts`.
- Spec exists: `docs/spec/api-versioning.md` (Status: Planned, this epic).
  No URL prefix, no `meta.api_version` envelope, no version resolver, no
  deprecation headers in the running app.

## Goals

1. **Full-transitive compatibility** — breaking changes never break clients.
2. **Explicit versioning** — version visible in URL, debuggable, cacheable.
3. **Zero-duplication** — shared business logic via the service layer; version
   differences live only at the request/response boundary.
4. **Graceful deprecation** — old versions stay until N-1, signalled with
   `Sunset` / `Deprecation` / `Link` headers.

## Versioning Scheme

```
/api/v1/{resource}          ← first versioned release
/api/v2/{resource}          ← next breaking version
/api/{resource}             ← legacy redirect → /api/v1/{resource}
```

| Change Type                            | Action                 | Example                         |
| -------------------------------------- | ---------------------- | ------------------------------- |
| Additive (new field/optional/endpoint) | Add to current version | `v1/actors` adds `avatar_url`   |
| Breaking (renamed/removed/changed)     | New version            | Pagination shape changes → v2   |
| Deprecation                            | Headers on old version | `Sunset`, `Deprecation`, `Link` |
| Removal                                | After N-1 versions     | v1 removed when v3 ships        |

Response envelope carries `meta.api_version`; paginated responses add
`meta.api_version` alongside their `pagination` block. Full shape in
`docs/spec/api-versioning.md`.

## Features

| Feature                    | Ticket   | Effort | Description                                     |
| -------------------------- | -------- | ------ | ----------------------------------------------- |
| Version prefix routing     | FEAT-035 | Med    | `src/routes/v1/` dir; mount under `/api/v1/`    |
| Response envelope version  | FEAT-036 | Low    | `meta.api_version` on all responses             |
| Legacy API redirect        | FEAT-037 | Low    | `/api/{resource}` → `/api/v1/{resource}`        |
| Deprecation headers        | FEAT-038 | Med    | `Sunset`/`Deprecation`/`Link` on deprecated ver |
| OpenAPI Swagger generation | FEAT-039 | Med    | Versioned OpenAPI spec (relies on EPIC-2026-32) |

## Phases

| Phase       | What                                                                                                  | Effort |
| ----------- | ----------------------------------------------------------------------------------------------------- | ------ |
| **Phase 0** | Add `meta.api_version` to existing responses. No URL change.                                          | Low    |
| **Phase 1** | Create `src/routes/v1/`, move current route modules, mount under `/api/v1/`, keep `/api/` → redirect. | Med    |
| **Phase 2** | On first breaking change, create `src/routes/v2/`.                                                    | Low    |
| **Phase 3** | Deprecate v1 headers; remove v1 after 12 months.                                                      | Low    |

## Acceptance Criteria

- [x] `meta.api_version` injected into all response helpers (Phase 0 complete)
- [x] `ApiResponseMeta` type exported from `http-utils/types.ts`
- [x] V1 barrel at `src/routes/v1/index.ts` mounts versioned routes via `.use()`
- [x] Version resolver middleware at `src/routes/middleware/version-resolver.ts` (built, but **not wired** — see BUG-version-resolver-middleware-built-not-wired)
- [x] Legacy redirect middleware at `src/routes/middleware/version-redirect.ts`
- [x] All 133 route factories accept optional `prefix` param (default `"/api"`)
- [x] 3 core routes wired into v1 barrel (health, chats, users)
- [x] V1 routes wired into `elysia-app.ts` with legacy redirect
- [x] Context propagation proven: `.derive()` userId flows through v1 barrel (integration test)
- [x] Existing `/api/*` routes keep working (backward compatible)
- [ ] Remaining routes added to v1 barrel (admin, characters, messages, assets, etc.) — 3/70+ done
- [ ] Version resolver middleware sets `ctx.apiVersion`; plugins read it — **resolver built but `versionResolver()` not called in `elysia-app.ts`** (only `versionRedirect` is wired)
- [ ] Deprecation headers on legacy `/api/*` routes
- [ ] OpenAPI spec generated per version (FEAT-039)

## Dependencies

- `docs/spec/api-versioning.md` — design contract (this epic's blueprint)
- Elysia route mounting refactor in `src/elysia-app.ts` (prerequisite)
- `docs/spec/api-routes.md`, `docs/spec/error-envelope.md` — current contract

## Linked Epics / Tasks

- **Prerequisite for:** OpenAPI reference (epic-openapi-reference.md), API/Library
  Distribution Mode, Headless Alternative Frontends — all list versioning as a
  blocker checkbox.
- **Distinct from:** DB Content Versioning (epic-db-content-versioning.md)
  — DB-level `data_version` columns, not HTTP API versioning.

## Files (proposed)

```
src/routes/
├── v1/                      ← current routes (frozen once v2 ships)
│   ├── index.ts             ← mounts all v1 routes
│   └── …
├── v2/                      ← next version (breaking changes only)
│   ├── index.ts
│   └── …
├── middleware/
│   └── version-resolver.ts
└── http-utils.ts            ← shared response helpers
```

## Linked Tasks

- FEAT-035.md — Version prefix routing (open)
- FEAT-036.md — Response envelope version (open)
- FEAT-037.md — Legacy API redirect (open)
- FEAT-038.md — Deprecation headers (open)
- FEAT-039.md — OpenAPI Swagger generation (open)
