# Open Items (Technical Debt)

Tracked code quality concerns that need cleanup. Each item links to source
files and describes the refactoring needed.

Items tagged `(plan.md)` are also tracked in the active v0.2 plan.

---

## DUP.1 Config Defaults Duplicated

**Severity**: High
**Source**: `docs/spec/architecture.md`, `src/config/schema.ts`, `src/config/schema-class.ts`

`src/config/schema.ts` defines `const DEFAULTS: Config` (lines 583–703) with
every config default value. `src/config/schema-class.ts` defines identical
instance field defaults (lines 52–179). File comment says "Keep schema.ts
interfaces + DEFAULTS for backward compat" but the two sources of truth will
drift.

**Fix**: Delete `DEFAULTS` object from `schema.ts`; import defaults from
`configSchema.defaults` instead. Ensure all consumers use the class-based
source.

---

## DUP.2 Async Log Queue Duplicated (Browser vs Server)

**Severity**: Medium
**Source**: `src/frontend/alpine/queue.ts`, `src/logger/queue.ts`

Both implement `AsyncLogQueue` with identical algorithm, constants, field
layout, and methods (~90 lines duplicated). Only ~10 lines differ:
`logger/queue.ts` uses `timer.unref()`, `process.stderr.write()`,
`flushSync()`. Frontend port uses `console.error()` fallback.

**Fix**: Extract a runtime-agnostic base class (`AsyncLogQueueBase`) into a
shared location. Subclass with Node vs browser overrides for the 10 diverging
lines.

---

## DUP.3 Generation Post-Response Finalization

**Severity**: Medium
**Source**: `src/generation/generate-route.ts` (plan.md)

Streaming and non-streaming paths both construct identical `GenerationResult`
objects and run identical message-insert queries (~40 lines duplicated).
Streaming path uses `MessageStatus.Partial` + `continuation_index`;
non-streaming uses `MessageStatus.Confirmed`.

**Fix**: Extract `storeGenerationResult()` and `buildGenerationResult()`
helpers.

---

## DUP.4 Chat Route Guard/Ownership Boilerplate

**Severity**: High
**Source**: `src/routes/chats.ts` (plan.md)

13 route handlers repeat the same 7-line unauthorized guard (`if (!userId)
return jsonError(...)`) and same 7-line ownership check (`fetch chat by id,
check created_by, return 403/404`). ~180 lines of boilerplate total — highest
refactoring value.

**Fix**: Extract `requireUser(context): string | Response` and
`requireChatAccess(database, chatId, userId, userRole): Promise<Response | true>`.
Apply to all 13 handlers.

---

## DUP.5 Message Ownership Check Boilerplate

**Severity**: Medium
**Source**: `src/routes/messages.ts` (plan.md)

4 handlers (`handleGetMessage`, `handleListVariants`, `handleSelectVariant`,
`handleUpdateVisibility`) repeat the same ~18-line fetch-message-then-fetch-chat
ownership check pattern. ~72 lines total.

**Fix**: Extract `requireMessageAccess(database, messageId, userId, userRole)`
helper.

---

## DUP.6 World Location Ownership Check Boilerplate

**Severity**: Low
**Source**: `src/routes/worlds.ts`

5 location handlers repeat the same 8-line world-ownership fetch + check
pattern. ~40 lines total.

**Fix**: Extract `requireWorldAccess(database, worldId, userId, userRole)`.
Note world-level handlers (get/update/delete world) also repeat this pattern
(~3 additional instances).

---

## DUP.7 Logger Public Method Boilerplate (Acceptable)

**Severity**: Info
**Source**: `src/frontend/alpine/logger.ts`, `src/logger/logger.ts`

~60 lines of identical public method delegation (log, child, flush, 4x
level methods). Both implement the same `Logger` interface for different
runtimes (browser vs Node). Shared interface constrains drift.

**Status**: Accepted — not worth abstracting. Different runtime dependencies
make sharing impractical.

---

## DUP.8 Lore Entry CRUD Config Similarity (Acceptable)

**Severity**: Info
**Source**: `src/routes/actor-lore-entries.ts`, `src/routes/world-lore-entries.ts`

Both pass near-identical config objects to `createEntityRoutes()` factory.
Field mappings, defaults, sort order, and JSON field lists are identical
because actor and world lore entries share the same table schema.

**Status**: Accepted — factory pattern already eliminates handler duplication.
Configs necessarily similar due to shared schema; further abstraction adds
complexity without benefit.

---

## BUG.1 Browser E2E — Solo/Seed User ID Mismatch

**Severity**: High
**Source**: `tests/e2e/` (plan.md)

Browser E2E tests seed data with deterministic IDs (`SEED.user.id`, etc.) but
server solo mode (`auth.required = false`) auto-creates a solo user with a
random UUID. Seeded data (owned by `SEED.user.id`) is invisible to the random
solo user.

**Fix**: Seed the solo user with `SEED.user.id` and `role: UserRole.Solo` before
page loads, or stub `getOrCreateSoloUserForAuth` to return `SEED.user.id`.

---

## BUG.2 Browser E2E — Parallel Suite Instability

**Severity**: Medium
**Source**: `tests/e2e/flows/browser/` (plan.md)

7 browser E2E test files sharing module-level singletons (`cachedSoloUser` in
`src/middleware/auth.ts:131`) corrupt each other's state under parallel load.
Also 7 Playwright browsers + 7 `Bun.serve` instances trigger timeouts.

**Fix**: Make `cachedSoloUser` per-request. Reduce parallelism or share server
fixture.

---

## BUG.3 Browser E2E — Cascade Failure Pattern

**Severity**: Medium
**Source**: `tests/e2e/flows/browser/` (plan.md)

Within a test file, any timeout/failure corrupts shared `ctx.page` state,
killing all subsequent tests.

**Fix**: Each test should operate on a fresh starting state.

---

## SCHEMA.1 Schema Types Missing Documented Columns

**Severity**: High
**Source**: `src/db/schema-story.ts`, `src/db/schema-core.ts`

`Worlds` missing `scan_depth` and `token_budget` (documented in `docs/actors.md`
and migration strategy). `Actors` missing character-card columns: `data_version`,
`welcome_message`, `personality`, `scenario`, `mes_example`,
`alternate_greetings`, `post_history_instructions`, `creator_notes`, `creator`,
`character_version`, `import_spec` (documented in `docs/actors.md`). Columns
exist on paper but have no TypeScript interface.

**Fix**: Add character-card fields to `schema-core.ts` Actors; add
`scan_depth`/`token_budget` to `schema-story.ts` Worlds.

---

## SCHEMA.2 NpcStates Lacks `created_at` Column

**Severity**: Low
**Source**: `src/db/schema-story.ts`

Every other table has `created_at` with `DEFAULT CURRENT_TIMESTAMP`. NpcStates
only has `updated_at`.

**Fix**: Add `created_at` column.

---

## CAST.1 HTTP Boundary `as` Casts Skip Validation

**Severity**: High
**Source**: `src/generation/generation-routes.ts`

`body as RetryFromPointRequest` and `body as ContinueRequest` skip all runtime
validation. A malformed request generates garbage queries.

**Fix**: Add Zod schemas or type guard functions for these two request shapes.

---

## CAST.2 Fire-and-Forget DB Writes Mask Failures

**Severity**: High
**Source**: `src/generation/cancellation-tracker.ts`, `src/generation/cancellation-actions.ts`

7 occurrences of `void ... .catch(() => {})` on DB writes. When the DB write
fails, in-memory `activeGenerations` map still holds state — but the DB row is
missing or has stale status. On restart, in-memory state is lost and DB shows
`pending` when it should show `processing` or `cancelled`.

**Fix**: Log failures. Make critical writes (start, complete) await.

---

## CAST.3 `selectAll()` + `as` Cast (3 sites)

**Severity**: Medium
**Source**: `src/generation/step-pipeline.ts`, `src/generation/cancellation-actions.ts`,
`src/generation/generation-routes.ts`

Kysely with `<DB>` generic returns `unknown` on `selectAll()`. Cast is
required but unchecked — if migration and schema.ts drift, the cast hides the
mismatch.

**Fix**: Use explicit `.select([...])` for typed results.

---

## CAST.4 Silent JSON Parse Error (4 sites)

**Severity**: Medium
**Source**: `src/generation/controller.ts`

`const body = await request.json().catch(() => ({}))` — malformed JSON body
becomes `{}` which passes if-checks only to fail with generic error. User has
no idea their JSON was malformed.

**Fix**: Return 400 with parse error message.

---

## CAST.5 Policy Config Type Erasure

**Severity**: Medium
**Source**: `src/generation/cancellation-tracker.ts`

`policyConfig.expectedPolicy` typed as `string` instead of `PolicyType`. Value
is cast back at use-site.

**Fix**: Type `expectedPolicy` as `PolicyType` directly.

---

## CAST.6 Truthy Check on DB String

**Severity**: Low
**Source**: `src/generation/continuation.ts`

`if (attempt?.partial_content)` — returned empty string `""` would be falsy and
skip the store, even though DB has the value.

**Fix**: Use `!== null` instead of falsy check.

---

## ENUM.1 Enum Barrel No Validation Match

**Severity**: Low
**Source**: `src/db/enums.ts` (plan.md)

Barrel re-exports but no validation enums match DB. Drift risk between enum
values and stored data.

**Fix**: Add runtime validation or test that enum values match DB CHECK
constraints.

---

## MIGRATION.1 Chat Participants PK Undocumented

**Severity**: Low
**Source**: `src/db/migrations/001_init.ts` (plan.md)

`chat_participants` PK on `(chat_id, actor_id)` but no unique constraint
documented.

**Fix**: Add comment or test documenting constraint.

---

## MIGRATION.2 No Index on Sessions(user_id, expires_at)

**Severity**: Low
**Source**: `src/db/migrations/001_init.ts` (plan.md)

No index for cleanup queries.

**Fix**: Add composite index.

---

## UTIL.1 safeJsonStringify Double Parse on Hot Path

**Severity**: Low
**Source**: `src/utils.ts` (plan.md)

Guarded mode parses JSON twice on hot path.

**Fix**: Cache parsed result or use single-pass approach.

---

## ASSISTANT.1 Config Schema `assistant.enabled` Check

**Severity**: Low
**Source**: `src/assistant/service.ts` (plan.md)

Config schema may not have `assistant.enabled`.

**Fix**: Verify config path or add fallback.

---

## ASSISTANT.2 Selective Memory Entries Ignored

**Severity**: Low
**Source**: `src/assistant/prompt-assembler.ts` (plan.md)

Selective entries (keys) parameter is ignored.

**Fix**: Implement keyword-based filtering.

---

## ASSISTANT.3 Token Budget Rebuild Bug

**Severity**: Low
**Source**: `src/assistant/prompt-assembler.ts` (plan.md)

Token budget enforcement message array rebuild has a bug.

**Fix**: Fix rebuild logic.

---

## TUI.1 ChatWidget Monkey-Patch

**Severity**: Low
**Source**: `src/tui/app.ts` (plan.md)

Monkey-patches `ChatWidget.setChatId` — fragile.

**Fix**: Use callback prop instead.

---

## TUI.2 No Retry/Idempotency Key

**Severity**: Low
**Source**: `src/tui/chat.ts` (plan.md)

No retry or idempotency key for API calls.

**Fix**: Add retry logic and idempotency keys.

---

## TUI.3 Left/Right Key Conflict

**Severity**: Low
**Source**: `src/tui/asset-view.ts` (plan.md)

Left/right navigation keys conflict with input navigation.

**Fix**: Scope key handlers to active context.

---

## AGE.1 runtimeConfig Module-Level Mutable

**Severity**: Low
**Source**: `src/age-gate/controller.ts` (plan.md)

`runtimeConfig` is module-level mutable state.

**Fix**: Use singleton class instead.

---

## BUILD.1 No Try/Catch on Single File Compress

**Severity**: Low
**Source**: `src/build/compress.ts` (plan.md)

Build crash on disk full.

**Fix**: Add try/catch around single file compression.