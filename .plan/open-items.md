# Open Items (Technical Debt)

Code quality concerns needing cleanup. Each item links to source files. Items tagged `(plan.md)` also tracked in active v0.1 plan.

---

## DUP.1 Config Defaults Duplicated — Resolved

> ✅ **Resolved:** Resolved in src/config/schema-class.ts — single source of truth

`DEFAULTS` object removed from `schema.ts`. `schema-class.ts` is single source of truth.

## DUP.2 Async Log Queue Duplicated — Resolved

> ✅ **Resolved:** Resolved — AsyncLogQueueBase extracted to src/logger/queue-base.ts

Extracted `AsyncLogQueueBase` to `src/logger/queue-base.ts`. Both node and browser extend it.

## DUP.3 Generation Post-Response Finalization — Resolved

> ✅ **Resolved:** Resolved — buildGenerationResult() and storeGenerationResult() helpers extracted

Extracted `buildGenerationResult()` and `storeGenerationResult()` helpers. Both streaming and non-streaming paths use shared helpers.

## DUP.4 Chat Route Guard/Ownership Boilerplate — Resolved

> ✅ **Resolved:** Resolved — requireUser(), requireChatAccess(), requireChatOwner() helpers added

Added `requireUser()`, `requireChatAccess()`, `requireChatOwner()` helpers. All handlers use shared authorization.

## DUP.5 Message Ownership Check Boilerplate — Resolved

> ✅ **Resolved:** Resolved — requireMessageAccess() helper at src/routes/messages.ts:88

`requireMessageAccess()` helper exists at line 88 in `src/routes/messages.ts`. Used in 4 handlers (lines 293, 319, 359, 476).

## DUP.6 World Location Ownership Check Boilerplate — Resolved

> ✅ **Resolved:** Resolved — requireWorldAccess() helper at src/routes/worlds.ts:44

`requireWorldAccess()` helper exists at line 44 in `src/routes/worlds.ts`. Used in 8 handlers (lines 114, 127, 151, 190, 210, 279, 318, 340, 374).

## DUP.7 Logger Public Method Boilerplate — Accepted

> ✅ **Resolved:** Accepted — different runtimes make sharing impractical

~60 lines of identical delegation in `src/frontend/alpine/logger.ts` and `src/logger/logger.ts`. Different runtimes make sharing impractical.

## DUP.8 Lore Entry CRUD Config Similarity — Accepted

> ✅ **Resolved:** Accepted — factory pattern already eliminates handler duplication

`src/routes/actor-lore-entries.ts` and `src/routes/world-lore-entries.ts` pass near-identical configs to `createEntityRoutes()`. Factory pattern already eliminates handler duplication.

## BUG.1 Browser E2E — Solo/Seed User ID Mismatch — Resolved

> ✅ **Resolved:** Resolved — browser-server.ts rewritten to use Elysia createApp() + seedSolo(db)

`browser-server.ts` rewritten to use Elysia `createApp()` and calls `seedSolo(db)` before startup, ensuring solo user has `SEED.solo.id`.

## BUG.2 Browser E2E — Parallel Suite Instability

**Severity**: Medium — `tests/e2e/flows/browser/`
7 test files sharing `cachedSoloUser` singleton corrupt state under parallel load. 7 Playwright browsers + 7 `Bun.serve` instances trigger timeouts. Fix: per-request `cachedSoloUser` or shared fixture.

## BUG.3 Browser E2E — Cascade Failure Pattern

**Severity**: Medium — `tests/e2e/flows/browser/`
Any timeout/failure corrupts shared `ctx.page`, killing all subsequent tests. Fix: each test operates on fresh starting state.

## SCHEMA.1 Schema Types Missing Documented Columns — Resolved

> ✅ **Resolved:** Resolved — scan_depth/token_budget added to schema-story.ts

Character-card columns already present in Actors schema. `scan_depth`/`token_budget` added to `schema-story.ts` Worlds.

## SCHEMA.2 NpcStates Lacks `created_at` — Resolved

> ✅ **Resolved:** Resolved — created_at already present

Already present: `created_at: Generated<string>`.

## CAST.1 HTTP Boundary `as` Casts Skip Validation — Resolved

> ✅ **Resolved:** Resolved — validateCancel(), validateRegenerate(), validateTestConnection() type guards added

Added `validateCancel()`, `validateRegenerate()`, `validateTestConnection()` type guard functions. Replaced all `body as Record<string, unknown>` casts.

## CAST.2 Fire-and-Forget DB Writes Mask Failures

**Severity**: High — `src/generation/cancellation-actions.ts`
4 `void updateAttemptStatus(...).catch()` on DB writes. Failure leaves in-memory state out of sync with DB. Fix: log failures, await critical writes.

## CAST.3 `selectAll()` + `as` Cast — Resolved

> ✅ **Resolved:** Resolved — replaced selectAll() with explicit .select([])

Replaced `selectAll()` with explicit `.select([...])` in `generation-routes.ts` and `cancellation-actions.ts`.

## CAST.4 Silent JSON Parse Error (4 sites) — Resolved

> ✅ **Resolved:** Resolved — proper try/catch returning 400

`src/generation/controller.ts:43-45` has proper try/catch returning 400 with parse error message.

## CAST.5 Policy Config Type Erasure — Resolved

> ✅ **Resolved:** Resolved — correctly typed as PolicyType

`policyConfig.expectedPolicy` correctly typed as `PolicyType` (line 34) imported from `../db/enums`.

## CAST.6 Truthy Check on DB String — Resolved

> ✅ **Resolved:** Resolved — uses null check

Line 40 uses `if (attempt && attempt.partial_content !== null)`.

## MIGRATION.1 Chat Participants PK Undocumented — Resolved

> ✅ **Resolved:** Resolved — PK documented in migrations

PK documented in `src/db/migrations/parts/004_chats_actors.ts:70` as `addPrimaryKeyConstraint("pk_chat_participants", ["chat_id", "actor_id"])`.

## UTIL.1 safeJsonStringify Double Parse — Resolved

> ✅ **Resolved:** Resolved — replaced with single try/JSON.parse block

Replaced `isJsonString` + `JSON.parse` double call with single `try { JSON.parse(value) }` block.

## ENUM.1 Enum Barrel No Validation Match — Resolved

> ✅ **Resolved:** Resolved — src/db/enums.test.ts with 40 validation tests

Added `src/db/enums.test.ts` with 40 validation tests covering all expected enum exports.

## ASSISTANT.1 Config Schema `assistant.enabled` — Resolved

> ✅ **Resolved:** Resolved — AssistantConfig has enabled boolean

`AssistantConfig` has `enabled: boolean`, default `true`.

## ASSISTANT.2 Selective Memory Entries Ignored — Resolved

> ✅ **Resolved:** Resolved — selectiveKeys added to PromptParams

Added `selectiveKeys` to `PromptParams`. Lore section builder uses explicit keys or falls back to `recentUserWords()`.

## ASSISTANT.3 Token Budget Rebuild Bug — Resolved

> ✅ **Resolved:** Resolved — index-based filtering instead of tail splice

Section dropping uses index-based filtering instead of tail splice.

## TUI.1 ChatWidget Monkey-Patch — Resolved

> ✅ **Resolved:** Resolved — ChatWidget accepts onChatChange callback

`ChatWidget` accepts `onChatChange` callback. No monkey-patch.

## TUI.2 No Retry/Idempotency Key

**Severity**: Low — `src/tui/chat.ts`
No retry logic or idempotency key handling. Messages send without retry on failure.

## TUI.3 Left/Right Key Conflict

**Severity**: Low — `src/tui/asset-view.ts:67-71`
Left/right key handlers registered on `screen.key(["left", "right"], ...)` conflict with input navigation. Fix: scope to active widget context.

## AGE.1 runtimeConfig Module-Level Mutable — Resolved

> ✅ **Resolved:** Resolved — replaced with AgeGateConfigStore singleton

Replaced with `AgeGateConfigStore` singleton class.

## BUILD.1 No Try/Catch on Single File Compress — Resolved

> ✅ **Resolved:** Resolved — try/catch around writeFileSync

Added try/catch around `writeFileSync` at `compress.ts:56-67`.

## TOOL.1 Evaluate Biome as Complementary Linter/Formatter

**Severity**: Info. Biome (Rust-based) could replace Prettier (~25x faster) and cover ~60-70% of non-type-aware ESLint rules. Type-aware rules must stay on ESLint. **Deferred.**

## HTTP.1 Landing `/` Static Read Bypasses `respondWithFile` — Resolved

> ✅ **Resolved:** Resolved — removed serveView("chat") call

Removed `serveView("chat")` call. Landing falls through to `respondWithFile` with compression and ETag.

## HTTP.2 Source/Artifact Divergence for View Templates

**Severity**: Low — `src/routes/views.ts`
Views served dynamically from `src/views/` with on-the-fly minification. Build-time minified copies in `dist/public/` unused. Consider caching minified templates.

## TEST.1 E2E — No Cross-Tenant Isolation Tests — Resolved

> ✅ **Resolved:** Resolved — cross-tenant tests added

Added cross-tenant tests to `chats.test.ts`, `messages.test.ts`, `characters.test.ts`, `worlds.test.ts`.

## TEST.2 E2E — Error Envelope Never Asserted — Resolved

> ✅ **Resolved:** Resolved — res.code assertions added

Added `res.code` assertions to all error tests.

## TEST.3 E2E — No Cancel-During-Generation Test

**Severity**: Medium — `tests/e2e/flows/generation.test.ts`
Cancel endpoint tested (lines 224-233) but no mid-stream cancellation test. Need: start generation, send cancel while streaming, verify inactive status.

## TEST.4 E2E — No Generation Idempotency Test

**Severity**: Medium — `tests/e2e/flows/generation.test.ts`
Idempotency keys used in tests (12 occurrences) but no duplicate-key test. Need: send same `idempotencyKey` twice, assert identical response.

## TEST.5 E2E — Test Ordering Fragile (Shared Mutable State)

**Severity**: Medium — `tests/e2e/flows/worlds.test.ts`, `story.test.ts`, `chats.test.ts`
Only `generation.test.ts` uses `beforeEach` (line 36). Others lack isolation. Fix: add `beforeEach` for fresh test data.

## TEST.6 E2E — Browser Auth Flow Incomplete

**Severity**: Medium — `tests/e2e/flows/browser/auth-flow.browser.ts`
Has login form renders + demo login link tests. Missing: successful login flow, demo login execution, logout, auth-dependent UI rendering.

## TEST.7 E2E — Browser Chat Flow Sends No Messages

**Severity**: Medium — `tests/e2e/flows/browser/chat-flow.browser.ts`
Only tests panel toggles (toggle-chat-list, toggle-gallery, toggle-character-info). Missing: message typing, sending, receiving.

## TEST.8 Unit — 17 Quick-Win Source Files Untested

**Severity**: Medium — Route unit tests exist (28 test files in src/routes/) but many are stubs. Need to expand coverage for ~1,400 lines of pure logic.

## TEST.9 Unit — Story Module Nearly Untested

**Severity**: Medium — `src/story/` has `game-master.test.ts` (22 tests) but quest-engine, quality-evaluator, turn-manager, world-state, events/* lack coverage.

## TEST.10 Unit — Personas Module Untested — Resolved

> ✅ **Resolved:** Resolved — src/personas/service.test.ts with 21 tests

> ✅ **Resolved:** Resolved — cross-tenant tests added

`src/personas/service.test.ts` exists with 21 tests. Coverage in place.

## TEST.11 Unit — Route Handler Isolation Missing

> ✅ **Resolved:** Resolved — cross-tenant tests added

**Severity**: Low — Route unit tests exist but lack handler isolation. Consider mocking DB layer for pure handler tests.

## TEST.12 E2E — RPG Mechanics No Tests

> ✅ **Resolved:** Resolved — cross-tenant tests added

**Severity**: Low — No `rpg.test.ts` in e2e. Dice, combat, equipment, XP, loot endpoints untested.

## ENUM.2 Boolean Integer Flags → Typed State Enums — Resolved

> ✅ **Resolved:** Resolved — 5 columns converted to string enums with state machines

5 columns converted to string enums with state machines. Migration 010 handles data transform.

## LINT.1 Frontend tsconfig Weakness — Resolved

> ✅ **Resolved:** Resolved — tsconfig.frontend.json aligned with backend

`tsconfig.frontend.json` aligned with backend: added `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`, `allowImportingTsExtensions`, `paths: @/*`. Typecheck passes clean.

## LINT.2 Frontend ESLint Weakness — Resolved

> ✅ **Resolved:** Resolved — frontend ESLint extended to strictTypeChecked + stylisticTypeChecked

Frontend block in `eslint.config.mjs` now extends `strictTypeChecked + stylisticTypeChecked` (was `recommended` only). Added `eslint-plugin-import` (no-cycle, order), `consistent-type-definitions`, `no-misused-promises`, `cognitive-complexity: [warn, 20]`. Frontend lint: 0 errors.

### LINT.2.1 eslint --fix Breaks Frontend Typecheck — Resolved

> ✅ **Resolved:** Resolved — loaders.d.ts converted to module-mode, vendor-shims.d.ts created

> ✅ **Resolved:** Resolved — frontend ESLint extended to strictTypeChecked + stylisticTypeChecked

Root cause and fix:

1. `loaders.d.ts` converted from script-mode to module-mode with `declare global { var ... }`. `declare var` inside `declare global` correctly augments `typeof globalThis`, so `eslint --fix` can safely transform `var` → `let`.
2. Created `vendor-shims.d.ts` (script-mode) for `declare module` ambient shims (alpinejs, @alpinejs/morph) — these don't work in module-mode .d.ts files.
3. Both entry points (`alpine/index.ts`, `pages.ts`) import `./loaders`.
4. `no-unnecessary-type-assertion: off` still needed for frontend (removes DOM element casts like `as HTMLLinkElement | null`).

## LINT.3 Backend Lint Errors from New Notification Files

**Severity**: Low — `src/notifications/service.ts`
2 errors: `unicorn/prefer-export-from` (line 17), `consistent-type-definitions` (line 81). No errors in `src/routes/notifications.ts`. Fix: re-export properly, use interface.

## TEST.3 E2E — Asset Upload Failures

**Severity**: Medium — `tests/e2e/flows/assets.test.ts`
POST /api/assets returns non-ok. Cascading failures: GET returns uploaded asset, links, delete all fail. Likely multipart handling or asset service issue.

## TEST.4 E2E — Actor Import GET Returns Non-OK

**Severity**: Medium — `tests/e2e/flows/import.test.ts`
Import succeeds (returns id) but GET /api/actors/:id returns non-ok. May be actor GET route or permission issue.

## TEST.5 E2E — World Items Endpoint Returns Falsy

**Severity**: Low — `tests/e2e/flows/story.test.ts`
GET /api/worlds/:id/items returns falsy. Story items endpoint not working correctly.

## TEST.6 Unit Coverage Gaps — Low-Coverage Routes

**Severity**: Medium — routes layer
Critical routes below 10% statement coverage: worlds (4%), story-items (5.3%), messages (5.6%), quests (6.7%), story-states (8.3%). Target: 80%+ coverage.
