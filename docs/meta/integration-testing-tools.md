# Integration Testing Tools: Bun + TypeScript + htmx/Alpine.js + REST API

Research report. Date: 2026-07-12.

## Current Project State

- **Runtime**: Bun `serve()` — no framework (no Express, no Elysia)
- **Router**: Custom dispatch chain (`src/routes/router.ts`) + middleware pipeline (`src/middleware/pipeline.ts`)
- **Validation**: Manual — `parseBody()` returns `Record<string, unknown>`, field extraction via `str()`/`num()` helpers
- **Error shape**: `{ error: string, code?: ErrorCode, details?: unknown }`
- **Test runner**: `bun:test` (Jest-compatible API)
- **Unit tests**: `*.test.ts` files colocated with source
- **E2E tests**: `tests/e2e/` — `bun:test` + custom `createTestServer()` (in-memory SQLite) + API client helper + Playwright for browser
- **Frontend**: htmx (HTML-over-the-wire), Alpine.js (SPA-like reactivity), server-rendered views
- **No existing**: OpenAPI spec, schema validator, contract tests, response type generation

---

## 1. API Contract / Schema Validation Tools

### 1.1 Zod + @asteasolutions/zod-to-openapi

| Field            | Detail                                   |
| ---------------- | ---------------------------------------- |
| Category         | Runtime validation + OpenAPI generation  |
| Bun compat       | Full — pure TypeScript, zero native deps |
| Setup complexity | Medium                                   |

**What it does**: Define schemas in Zod, derive TypeScript types via `z.infer`, generate OpenAPI 3.x spec via `@asteasolutions/zod-to-openapi`.

**Pros**:

- Single source of truth: schema = type + validation + docs
- Zod works everywhere (browser, server, Bun)
- `@asteasolutions/zod-to-openapi` is mature, actively maintained (7M+ weekly downloads)
- Can generate OpenAPI at build time or runtime
- Composable: share schemas between route handlers and test code

**Cons**:

- Adds runtime overhead (Zod schema objects live in memory)
- OpenAPI generation is manual step — schemas must be registered
- No built-in server framework integration — needs custom wiring

**Fit for loop-lore**: High. Zod schemas can replace current manual `parseBody()` + field extraction. OpenAPI spec can be generated from route definitions.

**Example wiring**:

```ts
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

const CreateActorSchema = z.object({
  displayName: z.string().min(1).max(100),
  actorType: z.enum(["character", "npc", "assistant"]),
  description: z.string().optional(),
});

// In route handler:
const body = await parseBody(request);
const parsed = CreateActorSchema.safeParse(body);
if (!parsed.success) {
  return jsonValidationError(
    parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  );
}
// parsed.data is fully typed
```

---

### 1.2 TypeBox + @sinclair/typebox

| Field            | Detail                                   |
| ---------------- | ---------------------------------------- |
| Category         | Runtime validation + JSON Schema         |
| Bun compat       | Full — pure TypeScript, zero native deps |
| Setup complexity | Low-Medium                               |

**What it does**: Define schemas as TypeScript objects (not functions), derives static types via `Static<typeof T>`, emits JSON Schema. Smaller runtime footprint than Zod (no method chain objects).

**Pros**:

- Smaller bundle, faster validation than Zod
- JSON Schema native — interoperable with any JSON Schema tool
- `typebox/openapi` package for OpenAPI conversion
- Works great with Elysia (used internally by Elysia's type system)

**Cons**:

- Less ergonomic API than Zod (object notation vs method chaining)
- Smaller ecosystem, fewer plugins
- OpenAPI generation needs separate `@sinclair/typebox/openapi` package

**Fit for loop-lore**: Medium-High. Better if minimizing bundle size matters. Zod has more mindshare/ecosystem.

---

### 1.3 ts-rest

| Field            | Detail                                         |
| ---------------- | ---------------------------------------------- |
| Category         | End-to-end contract — schema + routes + client |
| Bun compat       | Unknown — designed for Express/NestJS/Next.js  |
| Setup complexity | High                                           |

**What it does**: Define API contracts with Zod schemas, generate type-safe client and server. Full RPC-like experience.

**Pros**:

- Full type safety end-to-end
- Generated client eliminates manual fetch calls
- Contract serves as documentation

**Cons**:

- Heavily framework-coupled — adapters for Express, NestJS, Next.js
- No Bun-native adapter exists
- Over-engineering for htmx (htmx doesn't need typed JS client)
- Forces server framework choice

**Fit for loop-lore**: Low. Requires framework adapter that doesn't exist for Bun's native `serve()`. The generated client is useless for htmx frontend (htmx makes HTTP calls via HTML attributes, not JS fetch).

---

### 1.4 Elysi

| Field            | Detail                                         |
| ---------------- | ---------------------------------------------- |
| Category         | Bun-native web framework with end-to-end types |
| Bun compat       | Built for Bun — first-class                    |
| Setup complexity | Very High (rewrite)                            |

**What it does**: Fast Bun-native web framework. Type system integrates with TypeBox. Eden Treaty/HTTP generates type-safe clients. Elysia OpenAPI plugin auto-generates Swagger.

**Pros**:

- Best possible Bun integration
- End-to-end type safety built-in
- OpenAPI generation via `@elysiajs/swagger` plugin
- Validation middleware via `t` (TypeBox-based)
- Extremely fast

**Cons**:

- Requires complete server rewrite from `Bun.serve()` + custom router
- Lock-in to Elysia's patterns
- Migration cost for 20+ route modules + middleware pipeline

**Fit for loop-lore**: Medium (long-term). Best Bun-native option but rewrite cost is high. Worth evaluating for v1 or major refactor, not for MVP.

---

### 1.5 schemathesis (Python)

| Field            | Detail                                    |
| ---------------- | ----------------------------------------- |
| Category         | OpenAPI property-based testing            |
| Bun compat       | External tool — runs against any HTTP API |
| Setup complexity | Low (no code changes needed)              |

**What it does**: Reads OpenAPI spec, generates property-based tests — fuzzes endpoints with edge-case inputs, checks for 5xx errors, validates response schemas.

**Pros**:

- Zero code changes — purely external
- Finds real bugs (500 errors on malformed input, missing validation)
- Works with any API regardless of language
- CLI + CI integration

**Cons**:

- Requires OpenAPI spec to exist first
- Python dependency (pip install schemathesis)
- Doesn't validate htmx-specific behavior (needs browser tests for that)

**Fit for loop-lore**: High (layer 2). Add after OpenAPI spec exists. Complements unit/E2E tests.

---

### 1.6 Dredd

| Field            | Detail                                    |
| ---------------- | ----------------------------------------- |
| Category         | OpenAPI contract testing                  |
| Bun compat       | External tool — runs against any HTTP API |
| Setup complexity | Low                                       |

**Status**: Maintenance mode / deprecated. API Blueprint was its primary format. OpenAPI support exists but Schemathesis is the modern replacement.

**Fit for loop-lore**: Low. Use Schemathesis instead.

---

### 1.7 Pact (contract testing)

| Field            | Detail                                                           |
| ---------------- | ---------------------------------------------------------------- |
| Category         | Consumer-driven contract testing                                 |
| Bun compat       | Partial — Pact JS uses Node APIs, may work via Bun's Node compat |
| Setup complexity | High                                                             |

**What it does**: Consumer (frontend) defines expectations → generates contract → provider (API) verifies. Designed for microservices with multiple consumers.

**Pros**:

- Consumer-driven — tests what frontend actually uses
- Pact Broker for sharing contracts across teams

**Cons**:

- Overkill for single-app (htmx is same origin)
- Complex setup — Pact Broker, mock server, verification pipeline
- Bun compatibility uncertain (uses `http`, `net` Node modules heavily)

**Fit for loop-lore**: Low. Consumer-driven contracts make sense for distributed systems. Loop-lore is monolith with same-origin htmx frontend.

---

## 2. Runtime Request/Response Validation

### 2.1 Zod Middleware (Custom)

| Field            | Detail |
| ---------------- | ------ |
| Bun compat       | Full   |
| Setup complexity | Low    |

Wrap existing `parseBody()` or add a validation middleware that:

1. Parses body
2. Runs Zod/TypeBox schema
3. Returns 422 on failure
4. Attaches typed data to `RequestContext` on success

```ts
// src/middleware/validate.ts
import { z } from "zod";
import type { Middleware, RequestContext } from "./types";
import { jsonValidationError } from "../routes/http-utils";

interface ValidatedContext extends RequestContext {
  validatedBody: unknown;
}

export function validateBody<T extends z.ZodType>(schema: T): Middleware {
  return async (request, context, next) => {
    const body = await request.json().catch(() => null);
    if (!body) return jsonValidationError([{ field: "body", message: "Invalid JSON" }]);
    const result = schema.safeParse(body);
    if (!result.success) {
      return jsonValidationError(
        result.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      );
    }
    (context as ValidatedContext).validatedBody = result.data;
    return next();
  };
}
```

**Fit**: High. Minimal changes to existing code. Works with current middleware pipeline.

### 2.2 Response Shape Validation (Test-time)

Validate that API responses match expected shapes in tests:

```ts
const ActorSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  actor_type: z.enum(["character", "npc", "assistant"]),
  created_at: z.string().datetime(),
});

test("GET /api/actors/:id returns valid shape", async () => {
  const res = await api.get(`/api/actors/${id}`);
  expect(res.ok).toBe(true);
  expect(() => ActorSchema.parse(res.data)).not.toThrow();
});
```

**Fit**: High. Zero production overhead. Catches API drift in CI.

---

## 3. E2E / Integration Testing — Frontend-Backend

### 3.1 Playwright (already in use)

| Field            | Detail                                  |
| ---------------- | --------------------------------------- |
| Category         | Browser E2E                             |
| Bun compat       | Works — imported via `@playwright/test` |
| Setup complexity | Already set up                          |

**Current state**: Playwright used for browser smoke tests. Tests run via `bun:test` with custom `createBrowserTest()` helper.

**Gaps found**:

- No `playwright.config.ts` — tests use ad-hoc browser launch
- No built-in Playwright test runner (not using `npx playwright test`)
- htmx-specific assertions are manual (no library for "wait for htmx swap")

**Bun compatibility note**: Playwright's Node API works in Bun. The `@playwright/test` runner (Vitest-like) does NOT work with Bun — but it's not needed since project uses `bun:test`. The browser automation part (chromium, firefox, webkit) works fine.

### 3.2 htmx-Specific Testing Approaches

**htmx swap detection** — htmx swaps HTML into DOM after fetch. Testing needs to wait for swaps:

```ts
// Wait for htmx to finish swapping
await page.waitForFunction(() => !document.body.classList.contains("htmx-request"));

// Or wait for specific content to appear
await page.waitForSelector("[data-testid='message-bubble']");
```

**htmx header assertions** — htmx uses custom response headers:

```ts
const response = await page.request.post("/api/chats", { ... });
expect(response.headers()["hx-trigger"]).toBe("chatCreated");
```

**Alpine.js state assertions**:

```ts
const isOpen = await page.evaluate(() => {
  return Alpine.$data(document.querySelector("[x-data]")).open;
});
expect(isOpen).toBe(true);
```

### 3.3 API-level Integration Tests (existing pattern)

Current approach — `createTestServer()` with in-memory SQLite — works well:

```ts
const server = await createTestServer(); // starts Bun.serve on ephemeral port
const api = createClient(server.url); // fetch wrapper with auth
await api.loginAs("user", "pass");
const res = await api.post("/api/actors", { displayName: "Test" });
expect(res.ok).toBe(true);
```

**Recommendation**: Add response shape validation to these tests (see 2.2).

---

## 4. Bun Ecosystem Compatibility Summary

| Tool                           | Bun Compat | Notes                                         |
| ------------------------------ | ---------- | --------------------------------------------- |
| Zod                            | Full       | Pure TS, zero native deps                     |
| TypeBox                        | Full       | Pure TS, zero native deps                     |
| @asteasolutions/zod-to-openapi | Full       | Pure TS                                       |
| ts-rest                        | Poor       | No Bun-native adapter                         |
| Elysia                         | Native     | Built for Bun                                 |
| Schemathesis                   | External   | Python — runs against any HTTP API            |
| Dredd                          | Deprecated | Use Schemathesis                              |
| Pact JS                        | Uncertain  | Node API surface — Bun compat unknown         |
| Playwright                     | Works      | Browser automation works; test runner doesn't |
| Bun test                       | Native     | Already using                                 |
| bun:sqlite                     | Native     | Already using                                 |
| openapi-typescript             | Full       | Generates TS types from OpenAPI spec          |
| swagger-ui-dist                | Full       | Serve Swagger UI from static files            |

---

## 5. Recommendations — Ranked by Fit

### Tier 1: Add Now (low cost, high value)

| #   | Tool                                   | What to do                                                                                                                                                                                          | Effort   |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | **Zod**                                | Add `zod` as dependency. Define schemas for all API request/response types. Replace `parseBody()` with `schema.safeParse()`. Use `z.infer<typeof schema>` for TypeScript types in route handlers.   | 2-3 days |
| 2   | **Response shape validation in tests** | Add Zod schemas to existing E2E API tests — validate response shapes match expected types. Catches API drift in CI.                                                                                 | 0.5 day  |
| 3   | **Playwright config**                  | Create `playwright.config.ts` and migrate browser tests to Playwright test runner (optional — `bun:test` works fine). Add htmx-specific helper utilities (`waitForHtmxSwap`, `waitForAlpineState`). | 0.5 day  |

### Tier 2: Add Next (medium cost, medium value)

| #   | Tool                               | What to do                                                                                                      | Effort  |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- |
| 4   | **@asteasolutions/zod-to-openapi** | After Zod schemas exist, generate OpenAPI 3.x spec. Serve Swagger UI at `/api/docs`.                            | 1 day   |
| 5   | **Schemathesis**                   | Run against generated OpenAPI spec in CI. Find edge-case bugs.                                                  | 0.5 day |
| 6   | **openapi-typescript**             | Generate TypeScript types from OpenAPI spec (alternative to Zod-derived types if you want spec-first approach). | 0.5 day |

### Tier 3: Evaluate Later (high cost, evaluate after MVP)

| #   | Tool                 | What to do                                                                                                    | Effort    |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 7   | **Elysia migration** | Evaluate rewriting server on Elysia for built-in validation, OpenAPI, and type safety. High risk/high reward. | 1-2 weeks |

### Do NOT Use

- **ts-rest** — framework adapter mismatch (no Bun native adapter, generated client useless for htmx)
- **Dredd** — deprecated, Schemathesis is replacement
- **Pact** — overkill for monolith, Bun compat uncertain
- **Any React/Next.js/Vue/Svelte-specific tool** — project uses htmx + Alpine.js

---

## 6. Implementation Path (Recommended)

```
Phase 1: Zod Schemas
  ├── Add zod to package.json
  ├── Create src/schemas/ directory
  ├── Define request/response schemas for each route group
  ├── Wire validation into route handlers (replace manual parseBody)
  └── Add response schema validation to E2E tests

Phase 2: OpenAPI
  ├── Add @asteasolutions/zod-to-openapi
  ├── Create src/schemas/openapi.ts — register all schemas + routes
  ├── Serve Swagger UI at /api/docs
  └── Add schemathesis to CI

Phase 3: Browser Test Improvements
  ├── Create playwright.config.ts
  ├── Add htmx/alpine assertion helpers
  └── Expand browser test coverage
```
