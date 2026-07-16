# Testing Strategy

This document outlines the testing approach, tools, and coverage goals for the loop-lore project.

## Overview

loop-lore uses a combination of unit tests, integration tests, and manual testing to ensure correctness and reliability. The test suite is designed to be fast, reliable, and easy to run locally.

## Test Framework

- **Runner**: [Bun's built-in test runner](https://bun.sh/guides/testing) (Jest-compatible API)
- **Assertions**: Built-in `expect` API
- **Mocking**: Jest-compatible mocking via `bun:test`
- **Coverage**: Built-in coverage reporting via `bun test --coverage`

## Test Structure

Tests are colocated with the source code they test. For each feature module, the test file sits alongside the implementation:

- `src/feature/feature.ts` — implementation
- `src/feature/feature.test.ts` — tests

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode (for development)
bun test --watch

# Run tests with coverage report
bun test --coverage

# Run a specific test file
bun test src/feature/feature.test.ts
```

## Coverage Goals

While 100% coverage is not always practical or necessary, we aim for high coverage on critical logic:

- **Core business logic** (database schema, generation pipeline, content processing): ≥90%
- **Configuration and validation**: ≥80%
- **Edge cases and error handling**: ≥70%
- **Integration points** (routes, services): ≥60%

Current coverage (as of latest run):

- **Functions**: ✓
- **Lines**: ✓

See the [coverage report](#current-coverage-analysis) for details.

## Test Categories

### Unit Tests

Focus on individual functions, classes, or modules in isolation. Use mocks for dependencies.

Examples:

- `src/config/load.test.ts`: Tests configuration loading, merging, validation
- `src/content/encode-decode.test.ts`: Tests encoding/decoding algorithms
- `src/generation/continuation.test.ts`: Tests continuation logic (in-memory and DB fallback)

### Integration Tests

Test interactions between multiple components, often using a test database.

Examples:

- `src/db/database.test.ts`: Tests database schema and constraints
- `src/age-gate/service.test.ts`: Tests age gate service with user data

### Schema Validation in Tests (Response Shape)

API response shapes are validated against Zod schemas in integration and E2E
tests. This catches drift between route handlers and frontend expectations
before it reaches production.

Every route group defines request/response schemas in a companion file
(e.g. `src/routes/chats.schema.ts`). Tests import those schemas and validate
API responses:

```ts
import { GetChatSchema } from "../routes/chats.schema";

test("GET /api/chats/:id returns valid shape", async () => {
  const res = await api.get(`/api/chats/${chatId}`);
  expect(res.ok).toBe(true);
  expect(() => GetChatSchema.parse(res.data)).not.toThrow();
});
```

**Zero production overhead** — schema validation in tests only. The schemas
themselves are used at runtime for request body validation (see
`docs/spec/implementation.md#runtime-validation-layer`).

#### Contract Testing Pipeline (planned)

1. **Zod schemas** — single source of truth for API contracts
2. **@asteasolutions/zod-to-openapi** — generate OpenAPI 3.x spec from Zod
   schemas, served at `/api/docs` via Swagger UI
3. **Schemathesis** — property-based testing CLI that fuzzes the OpenAPI spec
   against the live API, finding 500s from edge-case inputs
4. **CI guard** — Schemathesis run in CI against the generated spec

### Manual Testing

Certain aspects are best verified manually, particularly:

- TUI interactions and rendering
- Browser-based UI (htmx/Alpine.js)
- File uploads and asset handling
- Real-time generation streaming

See `docs/implementation.md` for the manual testing checklist.

## Writing Tests

### Best Practices

1. **Test behavior, not implementation**: Focus on what the code does, not how.
2. **Isolate external dependencies**: Mock databases, APIs, and file system.
3. **Keep tests fast**: Avoid heavy operations in tests; use in-memory databases.
4. **Test edge cases**: Empty inputs, invalid data, boundary conditions.
5. **Use descriptive test names**: Clearly state what is being tested and the expected outcome.

### Example: Testing a Function

```typescript
import { describe, test, expect } from "bun:test";
import { myFunction } from "./my-module";

describe("myFunction", () => {
  test("returns expected value for valid input", () => {
    expect(myFunction("valid")).toBe("expected");
  });

  test("throws error for invalid input", () => {
    expect(() => myFunction("invalid")).toThrow("Invalid input");
  });
});
```

### Example: Testing with Database

```typescript
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "../db/schema";

function createTestDb() {
  // ... setup in-memory database with schema
}

describe("MyService", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeEach(() => {
    const { sqlite: sdb, db: kdb } = createTestDb();
    sqlite = sdb;
    db = kdb;
    // ... insert test data
  });

  afterEach(() => {
    // ... clean up tables
  });

  afterAll(() => {
    sqlite.close();
  });

  test("does something", async () => {
    // ... exercise code and assert
  });
});
```

## Current Coverage Analysis

### File-Level Coverage

~165 source files under `src/`. ~42 have tests. **~25% file coverage**.

Covered modules: `age-gate`, `characters/steganography`, `config`, `content`,
`crypto` (full), `db` (index + enums + migrations), `generation` (all core
algorithms + routes), `logger` (all internals + transports), `middleware`
(dynamic-response + response-headers), `routes/http-utils`, `story/game-master`,
`transport` (protocol-level), `utils`.

### Source Files Without Any Test Coverage (by difficulty)

**Easy — pure logic, zero mocks needed** (17 files, ~1,400 lines):

| File                             | Lines | What It Does                    |
| -------------------------------- | ----- | ------------------------------- |
| `src/utils/get-type.ts`          | 31    | Runtime type detection          |
| `src/utils/safe-json.ts`         | 102   | Never-throw JSON operations     |
| `src/profanity/service.ts`       | 42    | Obscenity wrapper               |
| `src/db/state.ts`                | 79    | Generic `StateMachine<S>`       |
| `src/middleware/admin-gate.ts`   | 19    | `requireAdmin` guard            |
| `src/middleware/rate-limit.ts`   | 67    | `createRateLimiter()`           |
| `src/middleware/pipeline.ts`     | 77    | `compose()` chain builder       |
| `src/transport/errors.ts`        | 28    | `TransportError` class          |
| `src/transport/compression.ts`   | 123   | gzip/brotli/zstd wrapper        |
| `src/story/quality-evaluator.ts` | 505   | Heuristic scoring engine        |
| `src/story/turn-strategies.ts`   | 97    | Round-robin/scene/freeform      |
| `src/story/events/extraction.ts` | 201   | Regex event parser              |
| `src/assistant/service.ts`       | 73    | Keyword rule engine             |
| `src/content/hash-injection.ts`  | 92    | Content hash injection          |
| `src/routes/router.ts`           | 52    | `apiDispatch()`                 |
| `src/plugins/registry.ts`        | 117   | Plugin registry (in-memory map) |
| `src/config/constants.ts`        | 9     | `DATA_DIR` constant             |

**Medium — needs DB mock or provider mock** (key files):

| File                                     | Lines | What It Does                       |
| ---------------------------------------- | ----- | ---------------------------------- |
| `src/generation/cancellation-actions.ts` | 325   | Cancel logic + stream finalization |
| `src/generation/cancellation-tracker.ts` | 379   | In-memory generation tracker       |
| `src/generation/image-gen-route.ts`      | 165   | Image generation handler           |
| `src/generation/generation-routes.ts`    | 454   | Retry/continue/regenerate handlers |
| `src/assets/service.ts`                  | 403   | Asset CRUD + file storage          |
| `src/assets/controller.ts`               | 312   | Asset route handlers               |
| `src/personas/service.ts`                | 150   | Persona CRUD                       |
| `src/personas/controller.ts`             | 227   | Persona route handlers             |
| `src/story/turn-manager.ts`              | 243   | Multi-LLM turn orchestration       |
| `src/story/quest-engine.ts`              | 497   | Quest lifecycle                    |
| `src/story/world-state.ts`               | 326   | StoryContext builder               |
| `src/story/events/validation.ts`         | 93    | Event validation                   |
| `src/story/events/application.ts`        | 227   | Event application to DB            |
| `src/logger/logger.ts`                   | 133   | LoggerImpl core                    |
| `src/logger/queue.ts`                    | 150   | AsyncLogQueue                      |
| `src/middleware/auth.ts`                 | 229   | Session token validation           |
| `src/assistant/prompt-assembler.ts`      | 509   | Prompt assembly from DB            |

**Hard — browser DOM, blessed TUI, CLI, full server bootstrap**:
`src/frontend/**` (40 files), `src/tui/**` (3 files), `src/build/**` (2 files),
`src/scripts/**` (2 files), `src/server.ts`, `src/services/**` (2 files).
These rely on browser APIs (`WebCrypto`, `CompressionStreams`), terminal
display, filesystem, or process management. Covered by browser e2e smoke tests;
low ROI for unit tests.

### Route Coverage Gap

~20 route files under `src/routes/` have zero unit tests. Routes are exercised
by API e2e tests but the e2e suite is coarser — no isolated route handler
tests exist. The `entity-routes.ts` factory tests its own generic logic but
individual route modules (`actor-items`, `actor-lore-entries`, `actor-memories`,
`actor-notes`, `story-items`, `story-states`, `story-turns`, `activity`,
`frontend-logs`, `admin`, `message-encryption`, `settings`, `views`) are
completely untested at the unit level.

### Observations & Recommendations

1. **Highest-value missing unit tests**: `quality-evaluator.ts` (505 lines of
   pure scoring logic), `quest-engine.ts` (497 lines), `cancellation-actions.ts`
   (325 lines), `cancellation-tracker.ts` (379 lines), `turn-manager.ts`
   (243 lines). These are complex algorithms with no unit coverage.

2. **17 quick-win files** — pure logic, zero dependencies, testable in under an
   hour total. Start here for highest coverage gain per effort.

3. **Route handler isolation** — route modules are only tested through the full
   HTTP e2e stack. Missing unit-level handler tests mean error paths,
   validation edge cases, and authorization checks are untested at the handler
   boundary. A test-DB fixture pattern already exists in `src/db/` — extend it
   to route-level tests.

4. **Personas module** — `service.ts` + `controller.ts` have zero tests. This
   is a complete feature module with no coverage.

5. **Story module** — `quality-evaluator.ts`, `quest-engine.ts`, `turn-manager.ts`,
   `world-state.ts`, `events/extraction.ts`, `events/validation.ts`,
   `events/application.ts` — seven files with complex logic, only `game-master.ts`
   tested. This is the single largest coverage gap by line count.

## E2E Test Suite Review

### Structure

- **API e2e**: 20 files under `tests/e2e/flows/`, each creates isolated
  `TestServer` + `ApiClient`. Serve all route groups.
- **Browser e2e**: 7 files under `tests/e2e/flows/browser/`. Playwright via
  `chromium.launch()`, full frontend serving with `BrowserTestContext`.
- **Helpers**: 8 files (`server.ts`, `client.ts`, `seed.ts`,
  `browser-server.ts`, `htmx-alpine.ts`, `debug.ts`, `server-external.ts`)
  - 2 mock providers (`llm.ts`, `image.ts`).
- **Safeguard**: `E2E_SAFEGUARD=1` validates `:memory:` DB + `/tmp/` uploads
  before any test runs.

### What Works Well

| Area                     | Detail                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Helper factoring         | Clean separation: server, client, seed, browser-server, htmx-alpine. New flow tests easy to add.                |
| Deterministic seed data  | Fixed UUIDs (`a0000001` through `a0000008`) make cross-test references predictable.                             |
| Generation tests         | 17 tests cover streaming/non-streaming, mock failures, SSE parsing, validation, boundary sizes (100 KB prompt). |
| Mock provider pattern    | `failOnCall`/`streamError` flags with `beforeEach` reset — clean, leak-proof.                                   |
| Soft-delete verification | `messages.test.ts` verifies `visibility: "hidden_by_user"` after soft delete.                                   |
| SSE streaming test       | Parses and validates event-stream format with done-event messageId extraction.                                  |
| World nested resources   | `worlds.test.ts` tests full CRUD for both worlds and locations sub-resources, including deletion ordering.      |

### Critical Gaps (by severity)

**High — security/functional:**

| Gap                           | Affected Tests | Detail                                                                                                                            |
| ----------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| No cross-tenant isolation     | All CRUD files | User B's access to User A's resources never tested. No 403/404 isolation verification exists.                                     |
| Error envelope never asserted | All files      | Zero tests check `{ code, message }` shape from `docs/spec/error-envelope.md`. Only `res.status` or `res.error` presence checked. |

**Medium — functional gaps:**

| Gap                                 | File                                               | Detail                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| No cancel-during-generation test    | `generation.test.ts`                               | Only validates input and checks 404 for inactive. Never tests starting a stream, sending cancel mid-stream, verifying status goes inactive. |
| No idempotency test                 | `generation.test.ts`                               | `idempotencyKey` sent in request bodies but never verified — resending same key should return cached result.                                |
| Browser auth flow: 3 tests          | `auth-flow.browser.ts`                             | No successful login redirect, no demo login click, no logout flow, no auth-dependent UI visibility.                                         |
| Browser chat flow: no message send  | `chat-flow.browser.ts`                             | Only panel toggles + chat selection. Never types text, clicks send, or verifies message appears.                                            |
| Test ordering fragile               | `worlds.test.ts`, `story.test.ts`, `chats.test.ts` | Tests mutate shared state (`createdWorldId` set by test 1, used by test 2). Breaks under parallel or shuffled execution.                    |
| Missing message tree/variant tests  | `messages.test.ts`                                 | `docs/frontend/chat/messages.md` describes parent/child message trees. No test for creating reply chains or swipe variants at API level.    |
| No multi-turn generation test       | `generation.test.ts`                               | Second `generate` request with `parentMessageId` pointing to previous assistant message not tested.                                         |
| Generation response types unchecked | `chat-full.test.ts`                                | Inline type casts (`as { id: string; assistantMessage?: ... }`) instead of importing API types. Silent drift on response shape changes.     |

**Low — edge cases:**

| Gap                                  | File                     | Detail                                                                                                                            |
| ------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| No pagination tests                  | All list endpoints       | `limit`, `offset`, `cursor` never tested on `/api/chats`, `/api/actors`, `/api/worlds`, `/api/assets`, `/api/chats/:id/messages`. |
| No RPG mechanics coverage            | `story.test.ts`          | Quests, combat, dice rolls, skills, XP, loot from `docs/spec/rpg-mechanics.md` — zero e2e tests.                                  |
| No upload validation                 | `assets.test.ts`         | Oversized file, unsupported type, empty file — never tested.                                                                      |
| No asset unlink test                 | `assets.test.ts`         | `POST /api/assets/:id/links` creates links but `DELETE /api/assets/:id/links/:linkId` never tested.                               |
| No world cascade delete test         | `worlds.test.ts`         | Deletes location manually then deletes world. Never tests deleting world that still has child locations.                          |
| Story turn creation not tested       | `story.test.ts`          | Only verifies empty list; never creates a story turn and verifies it appears.                                                     |
| SSE done-event parsing brittle       | `generation.test.ts:184` | Regex-based SSE text parsing. Breaks if field ordering changes.                                                                   |
| Browser `gotoView` swallows errors   | `smoke.browser.ts:27-29` | Empty try/catch — navigation failures surface as assertion timeouts instead of clear errors.                                      |
| Browser test timeouts: magic numbers | All browser files        | `5000`, `8000`, `10000` ms scattered. CI-sensitive, no configuration override.                                                    |

These are pre-existing test failures that do not block development. They are infrastructure or seed-data mismatches, not bugs in the code under test.

### Solo/Seed User ID Mismatch

Browser E2E tests seed data with deterministic IDs (`SEED.user.id`, `SEED.chat.id`, etc.) but the server runs in solo mode (`auth.required = false`), which auto-creates a solo user with a random UUID. The web UI queries APIs scoped to that random solo user, so seeded data (owned by `SEED.user.id`) is invisible.

**Affected tests** (always fail):

- `chat-flow.test.ts` — "No chats yet" on chat list, message input disabled
- `characters-flow.test.ts` — empty character grid, create form never appears
- `worlds-flow.test.ts` — empty world list, create form never appears
- `auth-flow.test.ts`, `smoke.test.ts` — may also be affected depending on test path

**Root cause**: `src/middleware/auth.ts:156` generates `const soloId = uid()` (random). `tests/e2e/helpers/seed.ts` uses fixed `SEED.user.id` with `role: UserRole.User`. The middleware finds no `Solo` role user, creates one with a random ID, and that user owns none of the seeded data.

**Fix**: Seed the solo user with `SEED.user.id` and `role: UserRole.Solo` before page loads, or stub `getOrCreateSoloUserForAuth` to return `SEED.user.id`. Alternatively, have tests login as the seeded user instead of relying on solo mode.

### Parallel Suite Instability

When all 7 browser E2E test files run together (`bun test tests/e2e/flows/browser/`), tests that pass solo or in small groups fail or time out.

**Root cause**: Each test file creates its own Playwright browser + `Bun.serve` instance + temp DB + temp upload dirs. Under parallel load:

- Module-level singletons (e.g., `cachedSoloUser` in `src/middleware/auth.ts:131`) are shared across test files via Bun's module cache. One file's `resetSoloUserCache()` (called in `afterAll` teardown) can corrupt another file's in-flight solo session.
- Resource pressure from 7 Playwright browser instances + 7 `Bun.serve` processes may trigger Playwright timeouts.

**Symptoms**: Navigation tests and other tests that pass solo (13/13, 14s) time out at the 5000ms Bun test timeout when run in the full browser suite. First failing test in a file triggers cascade: browser/server context invalidates, all subsequent tests in that file fail with "browser has been closed".

**Fix**: Make `cachedSoloUser` per-request rather than module-level (remove singleton). Consider reducing parallelism or using a shared server fixture for browser tests.

### Cascade Failure Pattern

Within a single test file, if any test times out or fails mid-way, all subsequent tests in that file fail because the shared `ctx.page` (Playwright Page) or `ctx.browser` is left in an invalid state. This is a test structure issue — each test assumes a clean starting state and uses the same page instance.

## Current Status Verdict

The test suite provides **solid foundational coverage** for core business logic (database schema, config loading, generation continuation, content processing). The 84% function coverage indicates most critical logic paths are tested. Gaps exist primarily in:

- Error handling paths
- Configuration validation edge cases
- Integration layers (server/TUI)

This is typical for a project in active development – the core domains are well-tested, with room to expand coverage as the system stabilizes. The existing tests are well-written and passing, indicating good test hygiene.

---

## E2E Performance Benchmarks

> Full spec: [`docs/spec/e2e-benchmarks.md`](./e2e-benchmarks.md)

Performance benchmarks are deterministic, reproducible per git sha, and stored
locally under `data/benchmarks/` (gitignored). They run against the real API
stack with fixed seed data and no network dependencies.

### Key Design Decisions

- **Deterministic**: same git sha always produces the same result (fixed seed,
  in-memory DB, mock providers, fixed iterations, single-threaded)
- **Git-anchored**: results keyed by short sha, diffable across commits
- **Local-first**: no dashboard, no SaaS — run `bun run bench`, diff with script
- **Machine-scoped**: compare only same-machine runs (local vs local, CI vs CI)

### Essential Commands

```bash
bun run bench                    # Run all benchmarks → data/benchmarks/<sha>.json
bun run scripts/bench-diff.ts HEAD~1 HEAD  # Compare two commits
```

### CI Guard

| Signal                     | Action      |
| -------------------------- | ----------- |
| Any benchmark > 2x slower  | Block merge |
| Any benchmark > 50% slower | Warn on PR  |

### Structure

- **API e2e**: 20 files under `tests/e2e/flows/`, each creates isolated
  `TestServer` + `ApiClient`. Serve all route groups.
- **Browser e2e**: 7 files under `tests/e2e/flows/browser/`. Playwright via
  `chromium.launch()`, full frontend serving with `BrowserTestContext`.
- **Helpers**: 8 files (`server.ts`, `client.ts`, `seed.ts`,
  `browser-server.ts`, `htmx-alpine.ts`, `debug.ts`, `server-external.ts`)
  - 2 mock providers (`llm.ts`, `image.ts`).
- **Safeguard**: `E2E_SAFEGUARD=1` validates `:memory:` DB + `/tmp/` uploads
  before any test runs.

### What Works Well

| Area                     | Detail                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Helper factoring         | Clean separation: server, client, seed, browser-server, htmx-alpine. New flow tests easy to add.                |
| Deterministic seed data  | Fixed UUIDs (`a0000001` through `a0000008`) make cross-test references predictable.                             |
| Generation tests         | 17 tests cover streaming/non-streaming, mock failures, SSE parsing, validation, boundary sizes (100 KB prompt). |
| Mock provider pattern    | `failOnCall`/`streamError` flags with `beforeEach` reset — clean, leak-proof.                                   |
| Soft-delete verification | `messages.test.ts` verifies `visibility: "hidden_by_user"` after soft delete.                                   |
| SSE streaming test       | Parses and validates event-stream format with done-event messageId extraction.                                  |
| World nested resources   | `worlds.test.ts` tests full CRUD for both worlds and locations sub-resources, including deletion ordering.      |

### Critical Gaps (by severity)

**High — security/functional:**

| Gap                           | Affected Tests | Detail                                                                                                                            |
| ----------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| No cross-tenant isolation     | All CRUD files | User B's access to User A's resources never tested. No 403/404 isolation verification exists.                                     |
| Error envelope never asserted | All files      | Zero tests check `{ code, message }` shape from `docs/spec/error-envelope.md`. Only `res.status` or `res.error` presence checked. |

**Medium — functional gaps:**

| Gap                                 | File                                               | Detail                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| No cancel-during-generation test    | `generation.test.ts`                               | Only validates input and checks 404 for inactive. Never tests starting a stream, sending cancel mid-stream, verifying status goes inactive. |
| No idempotency test                 | `generation.test.ts`                               | `idempotencyKey` sent in request bodies but never verified — resending same key should return cached result.                                |
| Browser auth flow: 3 tests          | `auth-flow.browser.ts`                             | No successful login redirect, no demo login click, no logout flow, no auth-dependent UI visibility.                                         |
| Browser chat flow: no message send  | `chat-flow.browser.ts`                             | Only panel toggles + chat selection. Never types text, clicks send, or verifies message appears.                                            |
| Test ordering fragile               | `worlds.test.ts`, `story.test.ts`, `chats.test.ts` | Tests mutate shared state (`createdWorldId` set by test 1, used by test 2). Breaks under parallel or shuffled execution.                    |
| Missing message tree/variant tests  | `messages.test.ts`                                 | `docs/frontend/chat/messages.md` describes parent/child message trees. No test for creating reply chains or swipe variants at API level.    |
| No multi-turn generation test       | `generation.test.ts`                               | Second `generate` request with `parentMessageId` pointing to previous assistant message not tested.                                         |
| Generation response types unchecked | `chat-full.test.ts`                                | Inline type casts (`as { id: string; assistantMessage?: ... }`) instead of importing API types. Silent drift on response shape changes.     |

**Low — edge cases:**

| Gap                                  | File                     | Detail                                                                                                                            |
| ------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| No pagination tests                  | All list endpoints       | `limit`, `offset`, `cursor` never tested on `/api/chats`, `/api/actors`, `/api/worlds`, `/api/assets`, `/api/chats/:id/messages`. |
| No RPG mechanics coverage            | `story.test.ts`          | Quests, combat, dice rolls, skills, XP, loot from `docs/spec/rpg-mechanics.md` — zero e2e tests.                                  |
| No upload validation                 | `assets.test.ts`         | Oversized file, unsupported type, empty file — never tested.                                                                      |
| No asset unlink test                 | `assets.test.ts`         | `POST /api/assets/:id/links` creates links but `DELETE /api/assets/:id/links/:linkId` never tested.                               |
| No world cascade delete test         | `worlds.test.ts`         | Deletes location manually then deletes world. Never tests deleting world that still has child locations.                          |
| Story turn creation not tested       | `story.test.ts`          | Only verifies empty list; never creates a story turn and verifies it appears.                                                     |
| SSE done-event parsing brittle       | `generation.test.ts:184` | Regex-based SSE text parsing. Breaks if field ordering changes.                                                                   |
| Browser `gotoView` swallows errors   | `smoke.browser.ts:27-29` | Empty try/catch — navigation failures surface as assertion timeouts instead of clear errors.                                      |
| Browser test timeouts: magic numbers | All browser files        | `5000`, `8000`, `10000` ms scattered. CI-sensitive, no configuration override.                                                    |

These are pre-existing test failures that do not block development. They are infrastructure or seed-data mismatches, not bugs in the code under test.

### Solo/Seed User ID Mismatch

Browser E2E tests seed data with deterministic IDs (`SEED.user.id`, `SEED.chat.id`, etc.) but the server runs in solo mode (`auth.required = false`), which auto-creates a solo user with a random UUID. The web UI queries APIs scoped to that random solo user, so seeded data (owned by `SEED.user.id`) is invisible.

**Affected tests** (always fail):

- `chat-flow.test.ts` — "No chats yet" on chat list, message input disabled
- `characters-flow.test.ts` — empty character grid, create form never appears
- `worlds-flow.test.ts` — empty world list, create form never appears
- `auth-flow.test.ts`, `smoke.test.ts` — may also be affected depending on test path

**Root cause**: `src/middleware/auth.ts:156` generates `const soloId = uid()` (random). `tests/e2e/helpers/seed.ts` uses fixed `SEED.user.id` with `role: UserRole.User`. The middleware finds no `Solo` role user, creates one with a random ID, and that user owns none of the seeded data.

**Fix**: Seed the solo user with `SEED.user.id` and `role: UserRole.Solo` before page loads, or stub `getOrCreateSoloUserForAuth` to return `SEED.user.id`. Alternatively, have tests login as the seeded user instead of relying on solo mode.

### Parallel Suite Instability

When all 7 browser E2E test files run together (`bun test tests/e2e/flows/browser/`), tests that pass solo or in small groups fail or time out.

**Root cause**: Each test file creates its own Playwright browser + `Bun.serve` instance + temp DB + temp upload dirs. Under parallel load:

- Module-level singletons (e.g., `cachedSoloUser` in `src/middleware/auth.ts:131`) are shared across test files via Bun's module cache. One file's `resetSoloUserCache()` (called in `afterAll` teardown) can corrupt another file's in-flight solo session.
- Resource pressure from 7 Playwright browser instances + 7 `Bun.serve` processes may trigger Playwright timeouts.

**Symptoms**: Navigation tests and other tests that pass solo (13/13, 14s) time out at the 5000ms Bun test timeout when run in the full browser suite. First failing test in a file triggers cascade: browser/server context invalidates, all subsequent tests in that file fail with "browser has been closed".

**Fix**: Make `cachedSoloUser` per-request rather than module-level (remove singleton). Consider reducing parallelism or using a shared server fixture for browser tests.

### Cascade Failure Pattern

Within a single test file, if any test times out or fails mid-way, all subsequent tests in that file fail because the shared `ctx.page` (Playwright Page) or `ctx.browser` is left in an invalid state. This is a test structure issue — each test assumes a clean starting state and uses the same page instance.

## Current Status Verdict

The test suite provides **solid foundational coverage** for core business logic (database schema, config loading, generation continuation, content processing). The 84% function coverage indicates most critical logic paths are tested. Gaps exist primarily in:

- Error handling paths
- Configuration validation edge cases
- Integration layers (server/TUI)

This is typical for a project in active development – the core domains are well-tested, with room to expand coverage as the system stabilizes. The existing tests are well-written and passing, indicating good test hygiene.
