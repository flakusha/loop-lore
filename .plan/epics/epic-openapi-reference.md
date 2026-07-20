# EPIC: OpenAPI-Driven API Reference

**Status:** ⬜ Not Started
**Priority:** P1-High
**Effort:** Medium
**Type:** Infrastructure
**Tags:** api, openapi, docs, vitepress, generation, typebox, elysia

## Overview

Auto-generate the API Reference from an OpenAPI spec derived from TypeScript
sources (Elysia routes + TypeBox schemas). This eliminates stale docs — the
reference always matches the code.

## Current State

| Area               | File                          | State      | Notes                       |
| ------------------ | ----------------------------- | ---------- | --------------------------- |
| API Reference      | `docs/reference/api.md`       | 🟡 Manual  | 196L hand-written markdown  |
| Route definitions  | `src/routes/*.ts`             | ✅ Elysia  | 30+ route files             |
| Validation schemas | `src/validation/schemas.ts`   | ✅ TypeBox | `t.Object`, `t.Union`, etc. |
| OpenAPI spec       | —                             | ❌         | No spec exists              |
| Spec generation    | —                             | ❌         | No code→spec pipeline       |
| Doc generation     | —                             | ❌         | No spec→markdown pipeline   |
| API versioning     | `docs/spec/api-versioning.md` | 📝 Planned | EPIC-2026-32 (prerequisite) |

## Design

### Pipeline

```
TypeScript sources (Elysia routes + TypeBox schemas)
  ↓  @elysiajs/swagger (or custom transformer)
OpenAPI 3.1 JSON spec
  ↓  redoc-cli / custom markdown transformer
VitePress-compatible markdown (docs/reference/api/)
  ↓  vitepress build
API Reference site (always current)
```

### Why This Works

- **Elysia** already supports `@elysiajs/swagger` which generates OpenAPI from route definitions
- **TypeBox** schemas are JSON Schema compatible → directly mappable to OpenAPI `components.schemas`
- **No duplication** — routes define behavior, schemas define shapes, spec derives from both
- **Build-time generation** — `bun run docs:gen` regenerates before VitePress build

### Spec Generation Options

| Approach                     | Pros                          | Cons                      |
| ---------------------------- | ----------------------------- | ------------------------- |
| `@elysiajs/swagger` plugin   | Zero config, real-time        | Requires running server   |
| `@elysiajs/swagger` export   | Static spec, no server needed | Must call export manually |
| Custom TypeBox→OpenAPI       | Full control, no runtime dep  | Must maintain transformer |
| `typebox-to-openapi` library | Community maintained          | May lag behind TypeBox    |

**Recommended:** `@elysiajs/swagger` export at build time — zero config, always accurate.

### Doc Generation

Two approaches for spec→VitePress markdown:

1. **redoc-cli** — generates static HTML from OpenAPI, embed as `<iframe>` or raw HTML
2. **Custom transformer** — OpenAPI JSON → markdown with VitePress-compatible headings

**Recommended:** redoc-cli for initial implementation (battle-tested), custom transformer later if needed.

## Tasks

### Phase 1 — OpenAPI Spec Generation

- [ ] Add `@elysiajs/swagger` to Elysia app (dev-only, behind config flag)
- [ ] Configure swagger plugin: title, version, description, servers
- [ ] Add OpenAPI metadata to routes (summary, description, tags, response schemas)
- [ ] Export static OpenAPI spec (`openapi.json`) at build time
- [ ] Add `scripts/gen-openapi.ts` — runs server briefly, fetches spec, writes to `docs/reference/openapi.json`
- [ ] Add `openapi` script to package.json: `bun run scripts/gen-openapi.ts`
- [ ] Unit tests for spec generation (validate against OpenAPI 3.1 schema)

### Phase 2 — API Reference from Spec

- [ ] Install `redoc-cli` (or `@redocly/cli`) as dev dependency
- [ ] Add `scripts/gen-api-docs.ts` — transforms `openapi.json` → VitePress markdown
- [ ] Generate per-tag pages: `docs/reference/api/{tag}.md` (Users, Chats, Characters, etc.)
- [ ] Add sidebar entries in VitePress config for generated API pages
- [ ] Add `docs:api` script: `bun run gen-openapi && bun run gen-api-docs`
- [ ] Integrate into `docs:gen` pipeline: `bun run docs:gen && bun run docs:api && vitepress build`

### Phase 3 — Build Integration

- [ ] Add OpenAPI generation to `docs:build` script
- [ ] Add OpenAPI generation to pre-commit hook (staged-only, fast path)
- [ ] Add OpenAPI freshness check to CI (compare generated spec vs committed)
- [ ] Add `ignoreDeadLinks` update for generated API pages
- [ ] Remove manual `docs/reference/api.md` (replaced by generated content)

### Phase 4 — Enrichment (Future)

- [ ] Add request/response examples to TypeBox schemas
- [ ] Add authentication annotations to protected routes
- [ ] Add rate-limit headers to OpenAPI spec
- [ ] Generate client SDK from OpenAPI spec (optional)
- [ ] Add changelog tracking (spec diff between versions)

## Dependencies

- Existing: `src/routes/*.ts` (Elysia routes)
- Existing: `src/validation/schemas.ts` (TypeBox schemas)
- Existing: `src/elysia-app.ts` (Elya app setup)
- New: `@elysiajs/swagger` (OpenAPI generation)
- New: `redoc-cli` or `@redocly/cli` (spec→HTML/markdown)
- Related: EPIC-2026-32 (API Versioning — version prefix in spec)

## Files (proposed)

- `scripts/gen-openapi.ts` — export OpenAPI spec from Elysia
- `scripts/gen-api-docs.ts` — transform spec → VitePress markdown
- `docs/reference/openapi.json` — generated spec (gitignored, regenerated)
- `docs/reference/api/` — generated per-tag API pages
- `docs/.vitepress/config.mts` — sidebar updates for API pages

## Open Questions

1. **Version gating:** Should the spec include versioned routes (v1, v2) or just current?
2. **Auth annotations:** Should protected routes show auth requirements in the spec?
3. **Examples:** How detailed should request/response examples be?
4. **Client generation:** Is SDK generation worth the complexity?
5. **CI check:** Should spec drift be a CI error or warning?

## Related Epics

- **EPIC-2026-32** — API Versioning Strategy (prerequisite for versioned spec)
- **EPIC-2026-16** — Observability & CI (CI integration)
