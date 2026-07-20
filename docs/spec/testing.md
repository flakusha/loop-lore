> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Testing Strategy

Unit tests, integration tests, E2E. Bun test runner, Jest-compatible API.

## Test Framework

- **Runner**: Bun's built-in test runner
- **Assertions**: `expect` API
- **Mocking**: `bun:test`
- **Coverage**: `bun test --coverage`

## Test Structure

Colocated with source: `src/feature/feature.test.ts`. ~165 source files under `src/`, ~42 with tests (~25% file coverage).

## Commands

## Coverage Goals

- Core business logic (DB schema, gen pipeline, content): ≥90%
- Config/validation: ≥80%
- Edge cases/error handling: ≥70%
- Integration (routes, services): ≥60%

## Test Categories

### Unit Tests

Individual functions in isolation. Examples: config loading, encode/decode, continuation logic.

### Integration Tests

Multi-component, often with test DB. Examples: DB schema/constraints, age gate service.

### Schema Validation in Tests

API responses validated against Elysia TypeBox (`t`) schemas in
`src/validation/schemas.ts`. Route groups define request/response shapes there;
tests import schemas and validate responses — zero production overhead.

#### Contract Testing Pipeline (aspirational)

> Note: a `src/schemas/` Zod layer does not exist; the Zod/OpenAPI pipeline below
> is aspirational (see `docs/meta/code-practices-improvements/06-schemas-and-openapi.md`).
> The current stack is Elysia `t` (TypeBox) in `src/validation/schemas.ts`.

1. TypeBox schemas as single source of truth
2. `elysia-swagger` / OpenAPI 3.x served at `/api/docs`
3. **Schemathesis** — property-based fuzzing of OpenAPI spec in CI

### Manual Testing

TUI rendering, browser UI (htmx/Alpine.js), file uploads, real-time streaming.

## Current Coverage Analysis

### Covered Modules

`age-gate`, `characters/steganography`, `config`, `content`, `crypto` (full), `db`, `generation` (core + routes), `logger` (all), `middleware` (response/headers), `routes/http-utils`, `story/game-master`, `transport`, `utils`.

### Files Without Tests — Quick Win (pure logic, ~17 files)

`src/utils/get-type.ts`, `src/utils/safe-json.ts`, `src/profanity/service.ts`, `src/db/state.ts`, `src/middleware/admin-gate.ts`, `src/middleware/rate-limit.ts`, `src/middleware/pipeline.ts`, `src/transport/errors.ts`, `src/transport/compression.ts`, `src/story/quality-evaluator.ts`, `src/story/turn-strategies.ts`, `src/story/events/extraction.ts`, `src/assistant/service.ts`, `src/content/hash-injection.ts`, `src/routes/router.ts`, `src/plugins/registry.ts`, `src/config/constants.ts`

### Key Files Needing DB/Provider Mocks

`cancellation-actions.ts`, `cancellation-tracker.ts`, `image-gen-route.ts`, `generation-routes.ts`, `assets/service.ts`, `assets/controller.ts`, `personas/service.ts`, `personas/controller.ts`, `turn-manager.ts`, `quest-engine.ts`, `world-state.ts`, `story/events/` (validation + application), `middleware/auth.ts`, `assistant/prompt-assembler.ts`

### Hard to Unit Test

Frontend (WebCrypto, CompressionStreams), TUI (blessed), build scripts, server bootstrap. Covered by browser E2E smoke tests.

### Priority Gaps

- `quality-evaluator.ts` (505 lines, pure logic, 0 tests)
- `quest-engine.ts` (497 lines)
- `cancellation-actions.ts` (325 lines)
- `cancellation-tracker.ts` (379 lines)
- `turn-manager.ts` (243 lines)
- All story events (extraction + validation + application: ~521 lines)

## E2E Test Suite

### Structure

- 20 files under `tests/e2e/flows/`, each creates isolated `TestServer` + `ApiClient`
- 7 browser files under `tests/e2e/flows/browser/` (Playwright via `chromium.launch()`)
- 8 helper files, 2 mock providers (LLM, image)

### What Works

- Clean helper factoring (server, client, seed, browser-server)
- Deterministic UUIDs (`a0000001`–`a0000008`)
- 17 gen tests covering streaming, mock failures, SSE parsing, boundary sizes
- Mock provider pattern with `failOnCall`/`streamError` + `beforeEach` reset
- SSE streaming test parsing event-stream format
- World nested resources CRUD

### Critical Gaps

- **No cross-tenant isolation** — User B accessing User A's resources never tested
- **Error envelope never asserted** — zero tests check `{ code, message }` shape
- **No cancel-during-generation test**
- **No idempotency test** (`idempotencyKey` sent but never verified)
- **Browser auth flow**: no login redirect, no demo login, no logout
- **Browser chat flow**: no message send tested
- **Missing message tree/variant tests** (parent/child reply chains, swipes)
- **No pagination tests** on any list endpoint
- **No RPG mechanics coverage** (quests, combat, dice, skills, XP, loot)
- **Story turn creation not tested**
- World cascade delete not tested
- Browser test timeouts: magic numbers (`5000`, `8000`, `10000`)

### Solo/Seed User ID Mismatch

Browser E2E seeds deterministic IDs but server runs in solo mode (`auth.required = false`), auto-creating a random solo user. Seeded data invisible. Fix: seed solo user with `SEED.user.id` and `UserRole.Solo`, or stub `getOrCreateSoloUserForAuth`.

### Parallel Suite Instability

7 browser test files sharing `cachedSoloUser` singleton via module cache. Teardown of one file corrupts another's session. Fix: make `cachedSoloUser` per-request.

## Verdict

Solid foundational coverage (84% function coverage). Core domains well-tested. Gaps in error handling, config validation edge cases, integration layers. Typical for active development.
