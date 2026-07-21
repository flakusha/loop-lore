# API Versioning Strategy

Status: Planned (EPIC-2026-32). No versioning exists today — all routes at `/api/{resource}`.

---

## Goals

1. **Full-transitive compatibility** — breaking changes never break existing clients
2. **Explicit versioning** — version visible in URL, debuggable, cacheable
3. **Zero-duplication** — shared business logic across versions via service layer
4. **Graceful deprecation** — old versions stay until N-1, with headers

---

## Current State

All routes mounted as Elysia plugins via `app.use(xxxRoutes(handleOpts))` in `src/elysia-app.ts`. No version prefix. Catch-all `app.all("/*")` delegates `/api/*` to legacy `handleApiRequest`.

**30+ route files** in `src/routes/`, plus controllers in `src/*/controller.ts`.

---

## Versioning Scheme

```
/api/v1/{resource}          ← first versioned release
/api/v2/{resource}          ← next breaking version
/api/{resource}             ← legacy redirect → /api/v1/{resource}
```

### Rules

| Change Type                                                        | Action                 | Example                                      |
| ------------------------------------------------------------------ | ---------------------- | -------------------------------------------- |
| **Additive** (new field, new optional param, new endpoint)         | Add to current version | `GET /api/v1/actors` adds `avatar_url` field |
| **Breaking** (renamed field, removed endpoint, changed pagination) | New version            | Pagination shape changes → v2                |
| **Deprecation**                                                    | Headers on old version | `Sunset`, `Deprecation`, `Link` headers      |
| **Removal**                                                        | After N-1 versions     | v1 removed when v3 ships                     |

---

## Response Envelope

Every response includes version metadata:

```json
{
  "data": { ... },
  "meta": {
    "api_version": "1",
    "deprecated": false
  }
}
```

Paginated responses:

```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "abc123",
    "has_more": true
  },
  "meta": {
    "api_version": "1"
  }
}
```

---

## Deprecation Headers

When a version is deprecated (newer version exists):

```http
Sunset: Sat, 01 Jan 2028 00:00:00 GMT
Deprecation: true
Link: </api/v2/actors>; rel="successor-version"
```

- `Sunset` = 12 months after new version ships
- `Deprecation: true` = signals client migration needed
- `Link` = points to replacement endpoint

---

## Implementation

### Route Structure

```
src/routes/
├── v1/                    ← current routes (frozen once v2 ships)
│   ├── index.ts           ← mounts all v1 routes
│   ├── actors.ts
│   ├── chats.ts
│   └── ...
├── v2/                    ← next version (breaking changes only)
│   ├── index.ts
│   └── ...
├── middleware/
│   └── version-resolver.ts
├── entity-routes.ts       ← shared factory (version-agnostic)
└── http-utils.ts          ← shared response helpers
```

### Mounting (elysia-app.ts)

```ts
import { v1Routes, } from "./routes/v1";
import { v2Routes, } from "./routes/v2";

// Versioned routes
app.use(v1Routes(handleOpts,),); // /api/v1/*
app.use(v2Routes(handleOpts,),); // /api/v2/*

// Legacy redirect: /api/{resource} → /api/v1/{resource}
app.all("/api/:resource", versionRedirect("v1",),);
app.all("/api/:resource/*", versionRedirect("v1",),);
```

### Version Resolver Middleware

```ts
// Resolves version from URL path (/api/v1/...) or falls back to Accept header
export function resolveVersion(request: Request,): string {
  const url = new URL(request.url,);
  const pathMatch = url.pathname.match(/^\/api\/v(\d+)\//,);
  if (pathMatch) { return pathMatch[1]; }

  // Content negotiation fallback
  const accept = request.headers.get("Accept",) ?? "";
  const vndMatch = accept.match(/application\/vnd\.loop-lore\.v(\d+)\+json/,);
  return vndMatch?.[1] ?? "1"; // default to v1
}
```

### Shared Business Logic

Version-specific handlers call the same services:

```ts
// routes/v1/actors.ts
import { actorService, } from "../../services/actor";

// V1 response shape
app.get("/api/v1/actors/:id", async (ctx,) => {
  const actor = await actorService.getById(ctx.params.id,);
  return { data: formatV1(actor,), meta: { api_version: "1", }, };
},);

// routes/v2/actors.ts
app.get("/api/v2/actors/:id", async (ctx,) => {
  const actor = await actorService.getById(ctx.params.id,);
  return { data: formatV2(actor,), meta: { api_version: "2", }, };
},);
```

---

## Migration Timeline

| Phase             | What                                                                                                      | Effort |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| **Phase 0** (now) | Add `meta.api_version` to all existing responses. No URL change.                                          | Low    |
| **Phase 1**       | Create `src/routes/v1/` dir, move current route modules. Mount under `/api/v1/`. Keep `/api/` → redirect. | Med    |
| **Phase 2**       | When first breaking change needed, create `src/routes/v2/`.                                               | Low    |
| **Phase 3**       | Deprecate v1 headers. After 12 months, remove v1.                                                         | Low    |

---

## Plugin Route Versioning

Plugins register for a specific API version:

```ts
// Plugin manifest
{
  "routes": {
    "v1": { "prefix": "/my-plugin", "handler": "./v1-routes.ts" },
    "v2": { "prefix": "/my-plugin", "handler": "./v2-routes.ts" }
  }
}
```

The version resolver middleware sets `ctx.apiVersion` which plugins read.

---

## Database Schema Impact

**None.** Version differences are purely at the API request/response layer. Database schema is version-agnostic. `data_version` columns (migration 018) track content format independently of API version.

---

## See Also

- `docs/spec/api-routes.md` — current route contract
- `docs/spec/error-envelope.md` — error response shape
- `docs/spec/architecture.md` — system layers
- `src/routes/entity-routes.ts` — generic CRUD factory
