# Open Items (Technical Debt)

Tracked code quality concerns that need cleanup. Each item links to source
files and describes the refactoring needed.

Items tagged `(plan.md)` are also tracked in the active v0.2 plan.

---

## DUP.1 Config Defaults Duplicated (Resolved)

**Severity**: High
**Source**: `docs/spec/architecture.md`, `src/config/schema.ts`, `src/config/schema-class.ts`

`src/config/schema.ts` previously defined `const DEFAULTS: Config` (lines 583–703) with
every config default value. `src/config/schema-class.ts` defines instance field defaults.

**Status**: Resolved — `DEFAULTS` object removed from `schema.ts`. Schema-class.ts is now the single source of truth for defaults.

---

## DUP.2 Async Log Queue Duplicated (Resolved)

**Status**: Resolved (2026-07-16) — Extracted `AsyncLogQueueBase` to `src/logger/queue-base.ts`. Node logger and browser queue now extend the shared base class.

---

## DUP.3 Generation Post-Response Finalization (Resolved)

**Severity**: Medium
**Source**: `src/generation/generate-route.ts` (plan.md)

Streaming and non-streaming paths both construct identical `GenerationResult`
objects and run identical message-insert queries (~40 lines duplicated).
Streaming path uses `MessageStatus.Partial` + `continuation_index`;
non-streaming uses `MessageStatus.Confirmed`.

**Fix**: Extract `storeGenerationResult()` and `buildGenerationResult()`
helpers.

**Status**: Resolved (2026-07-16) — Extracted `buildGenerationResult()` and `storeGenerationResult()` helpers. Both streaming and non-streaming paths now call the shared helpers.

---

## DUP.4 Chat Route Guard/Ownership Boilerplate (Resolved)

**Severity**: High
**Source**: `src/routes/chats.ts` (plan.md)

13 route handlers once repeated the same 7-line unauthorized guard and ownership check.
~180 lines of boilerplate consolidated via extracted helpers.

**Status**: Resolved (2026-07-16) — Added `requireUser()` and `requireChatAccess()`/`requireChatOwner()` helpers. All handlers now use the shared authorization logic.

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

## BUG.1 Browser E2E — Solo/Seed User ID Mismatch (Resolved)

**Severity**: High
**Source**: `tests/e2e/` (plan.md)

Browser E2E tests seed data with deterministic IDs (`SEED.user.id`, etc.) but
server solo mode (`auth.required = false`) auto-creates a solo user with a
random UUID. Seeded data (owned by `SEED.user.id`) is invisible to the random
solo user.

**Fix**: Seed the solo user with `SEED.user.id` and `role: UserRole.Solo` before
page loads, or stub `getOrCreateSoloUserForAuth` to return `SEED.user.id`.

**Status**: Resolved (2026-07-16) — `browser-server.ts` rewritten to use Elysia `createApp()` and calls `seedSolo(db)` before server startup, ensuring the solo user has `SEED.solo.id` and seeded data is visible.

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

## SCHEMA.1 Schema Types Missing Documented Columns (Resolved)

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

**Status**: Resolved (2026-07-16) — Character-card columns were already present in Actors schema. `scan_depth` and `token_budget` added to `schema-story.ts` Worlds as nullable `number | null`.

---

## SCHEMA.2 NpcStates Lacks `created_at` Column (Resolved)

**Severity**: Low
**Source**: `src/db/schema-story.ts`

Every other table has `created_at` with `DEFAULT CURRENT_TIMESTAMP`. NpcStates
only has `updated_at`.

**Status**: Resolved — Schema already has `created_at: Generated<string>` (line 3 in schema-story.ts). MIGRATION.1 and MIGRATION.2 were also addressed.

---

## CAST.1 HTTP Boundary `as` Casts Skip Validation (Resolved)

**Severity**: High
**Source**: `src/generation/generation-routes.ts`

`body as RetryFromPointRequest` and `body as ContinueRequest` skip all runtime
validation. A malformed request generates garbage queries.

**Fix**: Add Zod schemas or type guard functions for these two request shapes.

**Status**: Resolved (2026-07-16) — Added `validateCancel()`, `validateRegenerate()`, `validateTestConnection()` type guard functions. Replaced all `body as Record<string, unknown>` casts with validated guards. `validateRetryFromPoint()` and `validateContinue()` already existed.

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

## CAST.3 `selectAll()` + `as` Cast (3 sites) (Resolved)

**Severity**: Medium
**Source**: `src/generation/step-pipeline.ts`, `src/generation/cancellation-actions.ts`,
`src/generation/generation-routes.ts`

Kysely with `<DB>` generic returns `unknown` on `selectAll()`. Cast is
required but unchecked — if migration and schema.ts drift, the cast hides the
mismatch.

**Fix**: Use explicit `.select([...])` for typed results.

**Status**: Resolved (2026-07-16) — Replaced `selectAll()` with explicit `.select([...])` in `generation-routes.ts` (2 sites) and `cancellation-actions.ts` (1 site).

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

## CAST.6 Truthy Check on DB String (Resolved)

**Severity**: Low
**Source**: `src/generation/continuation.ts`

Previously `if (attempt?.partial_content)` — empty string `""` would be falsy and
skip the store.

**Status**: Resolved — Line 40 now uses `if (attempt && attempt.partial_content !== null)`.

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

## ASSISTANT.1 Config Schema `assistant.enabled` Check (Resolved)

**Severity**: Low
**Source**: `src/assistant/service.ts`

Config schema may not have `assistant.enabled`.

**Status**: Resolved — `AssistantConfig` has `enabled: boolean` in `schema.ts:37`, default `true` in `schema-class.ts:73`. Service checks `config.assistant?.enabled ?? false`.

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

---

## TOOL.1 Evaluate Biome as Complementary Linter/Formatter

**Severity**: Info
**Source**: `eslint.config.mjs`, `.prettierrc`, `package.json`

Biome (Rust-based linter+formatter) could replace Prettier for formatting
(~25x faster) and cover ~60-70% of non-type-aware ESLint rules (unicorn,
sonarjs equivalents). Type-aware typescript-eslint rules
(`strictTypeChecked`, `stylisticTypeChecked`) must stay on ESLint — Biome
has zero type-aware rules.

**Recommended approach (when ready):**

1. Port formatting to Biome (replace Prettier) — immediate speed win, low risk
2. Optionally add Biome lint rules as fast first pass, disable overlapping ESLint rules
3. Keep ESLint for type-aware rules; keep stylelint, markuplint, markdownlint

**Status**: Deferred. No action planned. Revisit when formatting speed or
config complexity becomes a pain point.

---

## HTTP.1 Landing `/` Static Read Bypasses `respondWithFile`

**Severity**: Medium
**Source**: `src/routes/views.ts` (landing branch), `src/server.ts` (`respondWithFile`)

The landing route serves `dist/public/index.html` via a raw `readFileSync` +
`new Response`, so it emits no `Content-Encoding`, `Vary`, or `ETag` — even
though `compressAssets` produced `.gz/.br/.zst` variants for that exact file.
Every other static path goes through `respondWithFile`, which negotiates the
compressed variant and sets ETag/304. The dynamic-response policy (HTTP.3)
will gzip/br this body at runtime, but it still re-compresses per request and
skips the ETag/304 short-circuit the static path already offers.

**Fix**: Route the landing branch through `respondWithFile` (export it from
`server.ts` or move the branch into the server fetch handler) so the
pre-built variant + ETag are reused.

---

---

## HTTP.1 Landing `/` Static Read Bypasses `respondWithFile`

**Severity**: Medium
**Source**: `src/routes/views.ts` (landing branch), `src/server.ts` (`respondWithFile`)

The landing route serves `dist/public/index.html` via a raw `readFileSync` +
`new Response`, so it emits no `Content-Encoding`, `Vary`, or `ETag` — even
though `compressAssets` produced `.gz/.br/.zst` variants for that exact file.

**Status**: Resolved (2026-07-16) — Removed `serveView("chat")` call in `views.ts`.
Landing now returns `null`, falling through to server.ts's `respondWithFile`
which serves the pre-built `index.html` with compression and ETag.

---

## HTTP.2 Source/Artifact Divergence for View Templates

**Severity**: Low
**Source**: `src/routes/views.ts` (`VIEWS_DIR`, `loadView`), `src/server.ts` (startup copy)

`views.ts` reads templates from raw `src/views` at request time, but startup
copies + minifies + compresses those same files into `dist/public`. The
minified `dist/public/*.html(.gz)` copies are effectively dead for routed
paths (`/views/*`, `/character/*`, `/worlds/*`) — they are only hit if a raw
`.html` path falls through to `respondWithFile`. The runtime dynamic-response
policy (HTTP.3) now minifies these on the fly, masking the waste, but the
build-time minified copies remain unused.

**Fix**: Either serve views from the already-minified `dist/public` copies,
or cache a minified version of each template at first load. Avoid paying
per-request `minifyHTMLContent` cost for otherwise-static templates.

---

## TEST.1 E2E — No Cross-Tenant Isolation Tests (Resolved)

**Severity**: High
**Source**: `tests/e2e/flows/{chats,messages,characters,worlds,assets}.test.ts`

No test verifies User A's resources are inaccessible to User B. Every API e2e
test logs in as one user only. The `SEED.admin` user exists but is never used
in an isolation test.

**Fix**: Add one test per resource type: User A creates resource, User B gets
403/404.

**Status**: Resolved (2026-07-16) — Added cross-tenant isolation tests to `chats.test.ts`, `messages.test.ts`, `characters.test.ts`, `worlds.test.ts`. Each test seeds data as User A, then verifies User B (admin) gets 403/404 on access.

## TEST.2 E2E — Error Envelope Never Asserted (Resolved)

**Status**: Resolved (2026-07-16) — Added `res.code` assertions to all error tests in chats.test.ts, messages.test.ts, auth.test.ts, characters.test.ts, assets.test.ts, worlds.test.ts, users.test.ts, and generation.test.ts. Updated `ApiResponse` interface in client.ts to expose `code` field.

## TEST.3 E2E — No Cancel-During-Generation Test

**Severity**: Medium
**Source**: `tests/e2e/flows/generation.test.ts`

Only validates `POST /api/generation/cancel` input and checks 404 for inactive
chats. Never tests: start a streaming generation, send cancel mid-stream, verify
status goes inactive via `GET /api/generation/status/:chatId`.

**Fix**: Start generation in fire-and-forget, wait 200ms, POST cancel, poll
status until inactive or timeout.

## TEST.4 E2E — No Generation Idempotency Test

**Severity**: Medium
**Source**: `tests/e2e/flows/generation.test.ts`

`idempotencyKey` sent in request bodies but never verified. Resending the same
key should return the cached result (same messageId, same content).

**Fix**: Send generate with `idempotencyKey: "test-key-1"`, then resend same
key, assert response is identical.

## TEST.5 E2E — Test Ordering Fragile (Shared Mutable State)

**Severity**: Medium
**Source**: `tests/e2e/flows/{worlds,story,chats}.test.ts`

Tests within a file mutate shared module-level variables (`createdWorldId`,
`createdLocationId`, `itemDefId`, `itemInstanceId`). Test 1 sets the variable,
test 2 consumes it. Breaks under parallel execution or test shuffling.

**Fix**: Use `beforeEach` to create fresh data per test. Remove inter-test
variable dependencies.

## TEST.6 E2E — Browser Auth Flow Incomplete

**Severity**: Medium
**Source**: `tests/e2e/flows/browser/auth-flow.browser.ts`

3 tests only: form rendering, htmx attribute presence, failed login error
non-empty. Missing: successful login + redirect, demo login click + redirect,
logout flow, auth-dependent UI elements (user menu, logout button).

**Fix**: Add full login → redirect → verify authenticated state → logout →
verify unauthenticated state flow.

## TEST.7 E2E — Browser Chat Flow Sends No Messages

**Severity**: Medium
**Source**: `tests/e2e/flows/browser/chat-flow.browser.ts`

Only tests panel toggles and chat selection. Never types text, clicks send,
or verifies message appears in list.

**Fix**: Select a chat, type message in input, click send, wait for message
element to appear in message list.

## TEST.8 Unit — 17 Quick-Win Source Files Untested

**Severity**: Medium
**Source**: `src/utils/get-type.ts`, `src/utils/safe-json.ts`,
`src/profanity/service.ts`, `src/db/state.ts`, `src/middleware/admin-gate.ts`,
`src/middleware/rate-limit.ts`, `src/middleware/pipeline.ts`,
`src/transport/errors.ts`, `src/transport/compression.ts`,
`src/story/quality-evaluator.ts`, `src/story/turn-strategies.ts`,
`src/story/events/extraction.ts`, `src/assistant/service.ts`,
`src/content/hash-injection.ts`, `src/routes/router.ts`,
`src/plugins/registry.ts`, `src/config/constants.ts`

~1,400 lines of pure logic with zero dependencies — testable with no mocking.

**Fix**: Write `.test.ts` files for these. Start with `quality-evaluator.ts`
(505 lines, highest value), then `state.ts`, `safe-json.ts`, `get-type.ts`.

## TEST.9 Unit — Story Module Nearly Untested

**Severity**: Medium
**Source**: `src/story/quality-evaluator.ts` (505 lines), `quest-engine.ts`
(497 lines), `turn-manager.ts` (243 lines), `world-state.ts` (326 lines),
`events/extraction.ts` (201 lines), `events/validation.ts` (93 lines),
`events/application.ts` (227 lines), `items.ts`

Only `game-master.ts` has tests. Seven files with complex logic (quest
lifecycle, multi-LLM turn orchestration, event extraction/validation/application,
heuristic scoring) have zero coverage.

**Fix**: Prioritize `quality-evaluator.ts` (pure scoring, easy) and
`events/extraction.ts` (pure regex, easy). Then `quest-engine.ts` and
`turn-manager.ts` (need DB mock).

**Progress**: `synthetic/generator.ts` (Phase 6) now has `synthetic/generator.test.ts`
(5 tests, 59 assertions) covering generation across all 6 `SyntheticDataType` and
status state-machine transitions. `game-master.ts` remains the only other tested
story file. The 7 files listed above are still untested.

## TEST.10 Unit — Personas Module Untested

**Severity**: Low
**Source**: `src/personas/service.ts` (150 lines), `src/personas/controller.ts`
(227 lines)

Complete CRUD feature module with zero test coverage.

**Fix**: Add unit tests for service layer (needs DB mock). Add controller
tests (needs HTTP request simulation).

## TEST.11 Unit — Route Handler Isolation Missing

**Severity**: Low
**Source**: `src/routes/{actor-items,actor-lore-entries,actor-memories,
actor-notes,story-items,story-states,story-turns,activity,frontend-logs,admin,
message-encryption,settings,views}.ts`

~20 route files have zero unit tests. Exercised only through full HTTP e2e
stack — error paths, validation edge cases, and authorization checks untested
at the handler boundary.

**Fix**: Create test-DB fixture for route-level tests. Start with
`entity-routes.ts` consumers (actor-items, actor-memories, actor-lore-entries,
actor-notes) since they share the same factory.

## TEST.12 E2E — RPG Mechanics No Tests

**Severity**: Low
**Source**: `docs/spec/rpg-mechanics.md`, `tests/e2e/flows/story.test.ts`

Dice rolls, combat, equipment, skills, XP, loot — specified but zero e2e or
unit test coverage. `story.test.ts` only covers item/state CRUD.

**Fix**: Add tests for dice roll endpoint, combat initialization, equipment
assignment, XP rewards, loot generation. Verify stat calculations.

**Severity**: Resolved (2026-07-12)
**Source**: `src/middleware/dynamic-response.ts`, `src/server.ts`, `src/config/schema.ts`

Runtime-templated HTML/CSS/JS/JSON responses previously bypassed both
minification and compression (only startup static files were optimized).
Added `DynamicResponsePolicy` — a fetch-handler middleware that validates,
minifies (strip whitespace + comments), and compresses (br/gzip via
`Accept-Encoding`) dynamic bodies above a size threshold. Configurable via
the `dynamicResponse` config block. SSE and already-encoded responses are
skipped. See tests in `src/middleware/dynamic-response.test.ts`.

**Follow-ups**: HTTP.1 (landing ETag reuse), HTTP.2 (template minify caching)
remain open.

---

## ENUM.2 Boolean Integer Flags → Typed State Enums (Resolved)

**Severity**: Medium
**Source**: `src/db/enums-core.ts`, `src/db/schema-core.ts`, `src/db/schema-story.ts`

Boolean-as-integer (0/1) columns lacked type safety and transition
validation. Converted to string enums with state machines:

- `chats.is_pinned` → `PinnedState` (unpinned/pinned)
- `personas.is_default` → `DefaultState` (not_default/default)
- `actor_notes.pinned` → `PinnedState` (unpinned/pinned)
- `actor_items.equipped` → `EquipState` (unequipped/equipped)
- `items.stackable` → `StackableState` (unique/stackable)

Each enum gets `StateDef` + `createMachine` for transition validation.
Migration 010 converts integer columns to text with data transform.
Frontend updated to use string enum values.

**Status**: Resolved (2026-07-15)
