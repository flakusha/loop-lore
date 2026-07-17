# Integration Testing Tools: Bun + TypeScript + htmx/Alpine.js + REST API

## Project State

- **Runtime**: Bun `serve()` — no Express/Elysia
- **Router**: Custom dispatch chain (`src/routes/router.ts`) + middleware pipeline (`src/middleware/pipeline.ts`)
- **Validation**: Manual `parseBody()` + `str()`/`num()` helpers
- **Error shape**: `{ error: string, code?: ErrorCode, details?: unknown }`
- **Test runner**: `bun:test`
- **E2E**: `tests/e2e/` — `bun:test` + `createTestServer()` (in-memory SQLite) + API client + Playwright
- **Frontend**: htmx (HTML-over-the-wire), Alpine.js (SPA-like reactivity), server-rendered views
- **No existing**: OpenAPI spec, schema validator, contract tests, response type generation

## 1. API Contract / Schema Validation Tools

### 1.1 Zod + @asteasolutions/zod-to-openapi

Single source of truth: schema = type + validation + docs. Replaces manual `parseBody()` + field extraction. OpenAPI spec generated from route definitions.

**Fit**: High. Pure TS, zero native deps.

### 1.2 TypeBox + @sinclair/typebox

JSON Schema native, smaller bundle than Zod. Less ergonomic but works with Elysia internally.

**Fit**: Medium-High. Zod has more ecosystem mindshare.

### 1.3 ts-rest

Full contract RPC. Framework-coupled — no Bun-native adapter. Generated client useless for htmx.

**Fit**: Low. Do not use.

### 1.4 Elysia

Bun-native framework with TypeBox types, Eden Treaty client, OpenAPI via `@elysiajs/swagger`. Requires complete server rewrite.

**Fit**: Medium (long-term). Too expensive for MVP.

### 1.5 schemathesis (Python)

Property-based testing from OpenAPI spec. Zero code changes. Finds 5xx on malformed input.

**Fit**: High (layer 2 — after OpenAPI spec exists).

### 1.6 Dredd

Deprecated in favor of Schemathesis.

**Fit**: Low. Use Schemathesis.

### 1.7 Pact (contract testing)

Consumer-driven contracts. Overkill for monolith with same-origin htmx frontend.

**Fit**: Low. Do not use.

## 2. Runtime Request/Response Validation

### 2.1 Zod Middleware (Custom)

Wrap `parseBody()` or add validation middleware: parse body → run schema → 422 on failure → attach typed data to `RequestContext`.

**Fit**: High. Minimal changes, works with current pipeline.

### 2.2 Response Shape Validation (Test-time)

Validate API responses match expected shapes in tests. Zero production overhead.

**Fit**: High. Catches API drift in CI.

## 3. E2E / Integration Testing — Frontend-Backend

### 3.1 Playwright (already in use)

Gaps: no `playwright.config.ts`, no htmx-specific assertions library.

### 3.2 htmx-Specific Testing

- Wait for swaps: `page.waitForFunction(() => !document.body.classList.contains("htmx-request"))`
- Assert headers: `response.headers()["hx-trigger"]`
- Alpine state: `page.evaluate(() => Alpine.$data(document.querySelector("[x-data]")).open)`

### 3.3 API-level Integration Tests (existing pattern)

`createTestServer()` + in-memory SQLite works well. Add response shape validation (see 2.2).

## 4. Bun Ecosystem Compatibility

| Tool                           | Bun Compat | Notes                                    |
| ------------------------------ | ---------- | ---------------------------------------- |
| Zod                            | Full       | Pure TS                                  |
| TypeBox                        | Full       | Pure TS                                  |
| @asteasolutions/zod-to-openapi | Full       | Pure TS                                  |
| ts-rest                        | Poor       | No Bun adapter                           |
| Elysia                         | Native     | Built for Bun                            |
| Schemathesis                   | External   | Python, runs against any HTTP API        |
| Playwright                     | Works      | Browser automation ok; test runner doesn't work with Bun |
| Bun test                       | Native     | Already using                            |
| bun:sqlite                     | Native     | Already using                            |
| openapi-typescript             | Full       | Generates TS types from OpenAPI spec     |

## 5. Recommendations — Ranked by Fit

### Tier 1: Add Now (low cost, high value)

| # | Tool | What | Effort |
|---|------|------|--------|
| 1 | Zod | Add `zod`, define API schemas, replace `parseBody()` with `schema.safeParse()`, use `z.infer` for types | 2-3d |
| 2 | Response shape validation | Add Zod schemas to E2E API tests | 0.5d |
| 3 | Playwright helpers | Create `playwright.config.ts`, add htmx/Alpine assertion utilities | 0.5d |

### Tier 2: Add Next (medium cost, medium value)

| # | Tool | What | Effort |
|---|------|------|--------|
| 4 | @asteasolutions/zod-to-openapi | Generate OpenAPI 3.x spec, serve Swagger UI at `/api/docs` | 1d |
| 5 | Schemathesis | Run against OpenAPI spec in CI | 0.5d |
| 6 | openapi-typescript | Generate TS types from OpenAPI spec | 0.5d |

### Tier 3: Evaluate Later

| # | Tool | What | Effort |
|---|------|------|--------|
| 7 | Elysia migration | Rewrite server on Elysia for built-in validation/OpenAPI/types | 1-2wk |

### Do NOT Use

ts-rest, Dredd, Pact, any React/Next.js/Vue/Svelte-specific tool.

## 6. Implementation Path

```
Phase 1: Zod Schemas
  ├── Add zod, create src/schemas/, define request/response schemas
  ├── Wire validation into route handlers (replace parseBody)
  └── Add response schema validation to E2E tests

Phase 2: OpenAPI
  ├── Add @asteasolutions/zod-to-openapi, register schemas + routes
  ├── Serve Swagger UI at /api/docs
  └── Add schemathesis to CI

Phase 3: Browser Test Improvements
  ├── Create playwright.config.ts
  ├── Add htmx/alpine assertion helpers
  └── Expand browser test coverage
```