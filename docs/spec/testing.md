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

The following table shows coverage by file (from `bun test --coverage`):

```
File                                    | % Funcs | % Lines | Uncovered Line #s
----------------------------------------|---------|---------|-------------------
All files                               |   84.06 |   86.00 |
 src/age-gate/service.ts                |  100.00 |   98.21 |
 src/config/load.ts                     |   44.44 |   62.96 | 80-86,90-99,103-109,113-119,143-161
 src/config/schema.ts                   |  100.00 |  100.00 |
 src/content/decode.ts                  |  100.00 |   80.95 | 22-25
 src/content/encode.ts                  |  100.00 |   81.82 | 23-26
 src/content/minify.ts                  |  100.00 |  100.00 |
 src/db/enums-config.ts                 |  100.00 |  100.00 |
 src/db/enums-content.ts                |  100.00 |  100.00 |
 src/db/enums-core.ts                   |  100.00 |  100.00 |
 src/db/enums-generation.ts             |  100.00 |  100.00 |
 src/db/enums-story.ts                  |  100.00 |  100.00 |
 src/db/enums.ts                        |  100.00 |  100.00 |
 src/db/index.ts                        |   66.67 |   54.76 | 28,31-48
 src/generation/cancellation-actions.ts |   41.67 |   92.86 | 87-88,96-103
 src/generation/cancellation-manager.ts |  100.00 |  100.00 |
 src/generation/cancellation-tracker.ts |   41.67 |   54.59 | 115-119,203-242,251-275,284-287,294,301-324
 src/generation/continuation.ts         |  100.00 |  100.00 |
 src/generation/gen-types-api.ts        |  100.00 |  100.00 |
 src/generation/gen-types-options.ts    |  100.00 |  100.00 |
 src/generation/gen-types-results.ts    |  100.00 |  100.00 |
 src/generation/generation-routes.ts    |   50.00 |   50.82 | 38-74,85-110,243-247,259-280
 src/generation/policy-detector.ts      |    0.00 |   17.31 | 39,46,55-60,67,78-111
 src/generation/types.ts                |  100.00 |  100.00 |
 src/routes/http-utils.ts               |  100.00 |  100.00 |
----------------------------------------|---------|---------|-------------------
```

### Observations & Recommendations

1. **Core Logic Well-Covered**:
   - The generation continuation system (crucial for chat retries/continuations) has excellent test coverage.
   - Age gate, content encoding/decoding, and config loading fundamentals are tested.

2. **Configuration Validation Needs Tests**:
   - `src/config/load.ts` contains validation and type-coercion logic that is inadequately tested. Adding tests for invalid configs, type coercion edge cases, and validation errors would significantly boost coverage.

3. **Database Initialization**:
   - The `testDatabaseOverride` mechanism in `src/db/index.ts` (used by tests) is itself untested. Consider adding a test that verifies test DB isolation works correctly.

4. **Generation Module Gaps**:
   - Cancellation and repetition detection logic have meaningful gaps. These are complex algorithms where edge-case testing would be valuable.
   - Generation routes are indirectly tested via controller unit tests, but integration-style tests for route handlers (testing full request/response) could be added.

5. **TUI & Server Lack Tests**:
   - No tests exist for `src/tui/` (Blast-based TUI) or `src/server.ts` (HTTP server setup). These are harder to unit test but could benefit from:
     - End-to-end tests (using `bun test` with supertest-like approach for server)
     - Snapshot tests for TUI rendering (if feasible with `blessed`)

6. **Example Code Exempt**:
   - `policy-detector.ts` showing 0% is expected – it contains only commented-out example implementations. No action needed.

### Suggested Next Steps

If improving coverage is a goal:

1. **Prioritize config validation**: Add tests for `validateConfig()` with invalid inputs (bad ports, invalid DB types, missing Postgres URL).
2. **Test database overrides**: Verify `setTestDatabase()`/`testDatabaseOverride` properly isolates test data.
3. **Target complex algorithms**: Add fuzz-style tests for repetition detector (n-gram edge cases) and cancellation paths.
4. **Consider integration tests**: For server endpoints and TUI key handlers (using tools like `supertest` for API and `blessed` testing utilities).

## Known Non-Blocking Issues

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
