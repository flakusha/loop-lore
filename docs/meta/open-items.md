# Open Items (Technical Debt)

Code quality concerns needing cleanup. Each item links to source files. Items tagged `(plan.md)` also tracked in active v0.2 plan.

---

## DUP.1 Config Defaults Duplicated — Resolved

`DEFAULTS` object removed from `schema.ts`. `schema-class.ts` is single source of truth.

## DUP.2 Async Log Queue Duplicated — Resolved

Extracted `AsyncLogQueueBase` to `src/logger/queue-base.ts`. Both node and browser extend it.

## DUP.3 Generation Post-Response Finalization — Resolved

Extracted `buildGenerationResult()` and `storeGenerationResult()` helpers. Both streaming and non-streaming paths use shared helpers.

## DUP.4 Chat Route Guard/Ownership Boilerplate — Resolved

Added `requireUser()`, `requireChatAccess()`, `requireChatOwner()` helpers. All handlers use shared authorization.

## DUP.5 Message Ownership Check Boilerplate

**Severity**: Medium — `src/routes/messages.ts`
4 handlers repeat ~18-line fetch-message-then-fetch-chat ownership check. Extract `requireMessageAccess()`.

## DUP.6 World Location Ownership Check Boilerplate

**Severity**: Low — `src/routes/worlds.ts`
5 location handlers + 3 world handlers repeat world-ownership fetch. Extract `requireWorldAccess()`.

## DUP.7 Logger Public Method Boilerplate — Accepted

~60 lines of identical delegation in `src/frontend/alpine/logger.ts` and `src/logger/logger.ts`. Different runtimes make sharing impractical.

## DUP.8 Lore Entry CRUD Config Similarity — Accepted

`src/routes/actor-lore-entries.ts` and `src/routes/world-lore-entries.ts` pass near-identical configs to `createEntityRoutes()`. Factory pattern already eliminates handler duplication.

## BUG.1 Browser E2E — Solo/Seed User ID Mismatch — Resolved

`browser-server.ts` rewritten to use Elysia `createApp()` and calls `seedSolo(db)` before startup, ensuring solo user has `SEED.solo.id`.

## BUG.2 Browser E2E — Parallel Suite Instability

**Severity**: Medium — `tests/e2e/flows/browser/`
7 test files sharing `cachedSoloUser` singleton corrupt state under parallel load. 7 Playwright browsers + 7 `Bun.serve` instances trigger timeouts. Fix: per-request `cachedSoloUser` or shared fixture.

## BUG.3 Browser E2E — Cascade Failure Pattern

**Severity**: Medium — `tests/e2e/flows/browser/`
Any timeout/failure corrupts shared `ctx.page`, killing all subsequent tests. Fix: each test operates on fresh starting state.

## SCHEMA.1 Schema Types Missing Documented Columns — Resolved

Character-card columns already present in Actors schema. `scan_depth`/`token_budget` added to `schema-story.ts` Worlds.

## SCHEMA.2 NpcStates Lacks `created_at` — Resolved

Already present: `created_at: Generated<string>`.

## CAST.1 HTTP Boundary `as` Casts Skip Validation — Resolved

Added `validateCancel()`, `validateRegenerate()`, `validateTestConnection()` type guard functions. Replaced all `body as Record<string, unknown>` casts.

## CAST.2 Fire-and-Forget DB Writes Mask Failures

**Severity**: High — `src/generation/cancellation-tracker.ts`, `cancellation-actions.ts`
7 `void ... .catch(() => {})` on DB writes. Failure leaves in-memory state out of sync with DB. Fix: log failures, await critical writes.

## CAST.3 `selectAll()` + `as` Cast — Resolved

Replaced `selectAll()` with explicit `.select([...])` in `generation-routes.ts` and `cancellation-actions.ts`.

## CAST.4 Silent JSON Parse Error (4 sites)

**Severity**: Medium — `src/generation/controller.ts`
`request.json().catch(() => ({}))` — malformed JSON becomes `{}`, passes checks, fails with generic error. Fix: return 400 with parse error message.

## CAST.5 Policy Config Type Erasure

**Severity**: Medium — `src/generation/cancellation-tracker.ts`
`policyConfig.expectedPolicy` typed as `string` instead of `PolicyType`. Fix: type directly.

## CAST.6 Truthy Check on DB String — Resolved

Line 40 uses `if (attempt && attempt.partial_content !== null)`.

## MIGRATION.1 Chat Participants PK Undocumented

**Severity**: Low — `src/db/migrations/001_init.ts`
`chat_participants` PK on `(chat_id, actor_id)` but no unique constraint documented. Fix: add comment or test.

## UTIL.1 safeJsonStringify Double Parse — Resolved

Replaced `isJsonString` + `JSON.parse` double call with single `try { JSON.parse(value) }` block.

## ENUM.1 Enum Barrel No Validation Match — Resolved

Added `src/db/enums.test.ts` with 40 validation tests covering all expected enum exports.

## ASSISTANT.1 Config Schema `assistant.enabled` — Resolved

`AssistantConfig` has `enabled: boolean`, default `true`.

## ASSISTANT.2 Selective Memory Entries Ignored — Resolved

Added `selectiveKeys` to `PromptParams`. Lore section builder uses explicit keys or falls back to `recentUserWords()`.

## ASSISTANT.3 Token Budget Rebuild Bug — Resolved

Section dropping uses index-based filtering instead of tail splice.

## TUI.1 ChatWidget Monkey-Patch — Resolved

`ChatWidget` accepts `onChatChange` callback. No monkey-patch.

## TUI.2 No Retry/Idempotency Key

**Severity**: Low — `src/tui/chat.ts`
Fix: add retry logic and idempotency keys.

## TUI.3 Left/Right Key Conflict

**Severity**: Low — `src/tui/asset-view.ts`
Left/right nav keys conflict with input nav. Fix: scope handlers to active context.

## AGE.1 runtimeConfig Module-Level Mutable — Resolved

Replaced with `AgeGateConfigStore` singleton class.

## BUILD.1 No Try/Catch on Single File Compress — Resolved

Added try/catch around `writeFileSync` at `compress.ts:56-67`.

## TOOL.1 Evaluate Biome as Complementary Linter/Formatter

**Severity**: Info. Biome (Rust-based) could replace Prettier (~25x faster) and cover ~60-70% of non-type-aware ESLint rules. Type-aware rules must stay on ESLint. **Deferred.**

## HTTP.1 Landing `/` Static Read Bypasses `respondWithFile` — Resolved

Removed `serveView("chat")` call. Landing falls through to `respondWithFile` with compression and ETag.

## HTTP.2 Source/Artifact Divergence for View Templates

**Severity**: Low — `src/routes/views.ts`, `src/server.ts`
Build-time minified copies in `dist/public/` are unused for routed paths. Dynamic response policy minifies on the fly. Fix: serve from `dist/public/` or cache minified templates.

## TEST.1 E2E — No Cross-Tenant Isolation Tests — Resolved

Added cross-tenant tests to `chats.test.ts`, `messages.test.ts`, `characters.test.ts`, `worlds.test.ts`.

## TEST.2 E2E — Error Envelope Never Asserted — Resolved

Added `res.code` assertions to all error tests.

## TEST.3 E2E — No Cancel-During-Generation Test

**Severity**: Medium — `tests/e2e/flows/generation.test.ts`
Start generation, send cancel mid-stream, verify inactive status.

## TEST.4 E2E — No Generation Idempotency Test

**Severity**: Medium — `tests/e2e/flows/generation.test.ts`
Send same `idempotencyKey` twice, assert identical response.

## TEST.5 E2E — Test Ordering Fragile (Shared Mutable State)

**Severity**: Medium — `tests/e2e/flows/{worlds,story,chats}.test.ts`
Tests share module-level variables. Fix: `beforeEach` fresh data per test.

## TEST.6 E2E — Browser Auth Flow Incomplete

**Severity**: Medium — `tests/e2e/flows/browser/auth-flow.browser.ts`
Missing: successful login, demo login, logout, auth-dependent UI.

## TEST.7 E2E — Browser Chat Flow Sends No Messages

**Severity**: Medium — `tests/e2e/flows/browser/chat-flow.browser.ts`
Only tests panel toggles. Never types or sends messages.

## TEST.8 Unit — 17 Quick-Win Source Files Untested

**Severity**: Medium — ~1,400 lines of pure logic, zero dependencies.

## TEST.9 Unit — Story Module Nearly Untested

**Severity**: Medium — 7 files (quest-engine, quality-evaluator, turn-manager, world-state, events/*) zero coverage.

## TEST.10 Unit — Personas Module Untested

**Severity**: Low — `src/personas/service.ts` (150L), `controller.ts` (227L).

## TEST.11 Unit — Route Handler Isolation Missing

**Severity**: Low — ~20 route files zero unit tests.

## TEST.12 E2E — RPG Mechanics No Tests

**Severity**: Low — dice, combat, equipment, XP, loot zero coverage.

## ENUM.2 Boolean Integer Flags → Typed State Enums — Resolved

5 columns converted to string enums with state machines. Migration 010 handles data transform.
