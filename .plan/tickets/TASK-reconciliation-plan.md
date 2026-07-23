# TASK: Backend Logic Reconciliation Plan

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Epic:** epic-logic-reconciliation

## Summary

Comprehensive analysis of backend code state: logic correctness, wiring integrity, and test coverage. Identifies critical gaps where implemented features are never called, security holes, and duplicate logic.

## Analysis Results

### 1. Test Coverage

- **1575 tests, all passing** (good baseline)
- **1216 source files, 107 test files (8.8% file-level coverage)**
- Routes: 33 of 47 route files have tests (70%)
- Routes WITHOUT tests (13): `activity-stream`, `admin-character-overrides`, `character-availability`, `character-avatars`, `character-emotions`, `character-io`, `character-licensing`, `character-mood`, `character-relationships`, `character-traits`, `chat-context`, `export`, `i18n`, `import`, `message-reactions`
- Backend dirs with 0 tests: `src/chat` (15 files), `src/auth` (2 files), `src/telemetry` (3 files), `src/image-edit` (4 files), `src/services` (2 files)

### 2. Critical Logic Issues

#### A. Unwired Orchestration (CRITICAL — highest priority)

The following modules are fully implemented and tested but **never imported outside their own test files**:

| Module                                                                                               | File                              | Lines | Tests       | Status                                            |
| ---------------------------------------------------------------------------------------------------- | --------------------------------- | ----- | ----------- | ------------------------------------------------- |
| `GameMasterService`                                                                                  | `src/story/game-master.ts`        | 271   | ✅ 13 tests | ❌ Dead code — never wired to generation pipeline |
| `injectChatMemories`                                                                                 | `src/chat/memory-injection.ts`    | 200+  | ❌ 0 tests  | ❌ Never called                                   |
| `promoteMessagesToMemory`                                                                            | `src/chat/memory-promotion.ts`    | 200+  | ❌ 0 tests  | ❌ Never called                                   |
| `pruneMessages`                                                                                      | `src/chat/pruning.ts`             | 250+  | ❌ 0 tests  | ❌ Never called                                   |
| `createTransition` / `detectTransitionType` / `isTransitionMessage`                                  | `src/chat/transitions.ts`         | 150+  | ❌ 0 tests  | ❌ Never called                                   |
| `generateRuleName` / `buildRenamePrompt`                                                             | `src/chat/auto-rename.ts`         | 100+  | ❌ 0 tests  | ❌ Never called                                   |
| `detectHallucinations`                                                                               | `src/chat/hallucination-guard.ts` | 200+  | ❌ 0 tests  | ❌ Never called                                   |
| `checkModerationPermission` / `createModerationAction` / `isBanned` / `isBlocked` / `getShadowState` | `src/chat/moderation.ts`          | 150+  | ❌ 0 tests  | ❌ Never called                                   |

**Impact:** Story mode (GM orchestration), context pruning, memory injection, auto-renaming, hallucination detection, and moderation are all implemented but inactive. The generation pipeline (`generate-route.ts` + `auto-gen.ts`) does NOT call any of these.

#### B. Turn Number Double-Count Bug

- `TurnManager.selectNextActor()` increments `currentTurn` BEFORE selecting the actor
- `GameMasterService.executeTurn()` uses `this.turnManager.currentTurn + 1` for turnNumber
- Result: turn numbers are off by one (0→1 via selectNextActor, then 1+1=2 via executeTurn)

#### C. Duplicate Logic

- `routes/messages.ts` has its own `assertChatAccess()` and `requireMessageAccess()` — duplicates `checkChatAccess()` and `getMessageWithAccess()` from `chat/service.ts`
- `routes/messages.ts` has its own message listing + variant logic — duplicates `listMessages()` and `getMessageVariants()` from `chat/service.ts`
- `routes/chat-context.ts` has its own context window logic — duplicates `getChatContext()` from `chat/service.ts`

### 3. Security Issues

| Issue                                          | File(s)                                                                                                                                                                          | Severity |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| No ownership check on character CRUD           | `character-mood.ts`, `character-relationships.ts`, `character-traits.ts`, `character-licensing.ts`, `character-availability.ts`, `character-emotions.ts`, `character-avatars.ts` | High     |
| No message access check on reaction DELETE     | `message-reactions.ts`                                                                                                                                                           | Medium   |
| SSRF risk: arbitrary URL fetch                 | `import.ts` (import from URL)                                                                                                                                                    | Medium   |
| Manual cookie parsing bypasses auth middleware | `export.ts`                                                                                                                                                                      | Low      |
| Server starts before migrations complete       | `server.ts`                                                                                                                                                                      | Medium   |

### 4. Wiring Analysis — Actual Generation Pipeline

Current flow (what IS wired):

1. User posts message → `routes/messages.ts` → `triggerAutoGeneration()`
2. `triggerAutoGeneration()` → resolves provider → `PromptAssembler.assemble()` → calls LLM
3. Group chat: `selectNextGroupActor()` → `TurnManager.selectNextActor()` → cascade
4. Story mode: falls through to same `triggerAutoGeneration()` — **GameMasterService NOT used**
5. Memory extraction: `extractAndStoreMemories()` — ✅ wired correctly
6. Everything else: ❌ not wired

## Reconciliation Plan

### Phase 1: Critical Fixes (High Value)

**Priority order:** chat > memories > characters > assistant > NSFW

#### 1.1 Wire GameMasterService into story mode generation

- **Problem:** `GameMasterService` is fully tested but never called. Story mode uses the same `triggerAutoGeneration()` path as direct/group chat.
- **Fix:** In `generation/auto-gen.ts`, when `chat.type === "story"`, use `GameMasterService.executeTurn()` + `acceptResponse()` instead of direct LLM call.
- **Tests needed:** Integration test for story mode generation path.

#### 1.2 Fix turn number double-count

- **Problem:** `selectNextActor()` increments `currentTurn`, then `executeTurn()` adds 1 again.
- **Fix:** Either remove the increment from `selectNextActor()` or remove the `+1` from `executeTurn()`.
- **Tests needed:** Update existing turn-manager tests.

#### 1.3 Wire chat service functions into routes

- **Problem:** `getChatContext`, `getFeatureFlags`, `getResponseLength` from `chat/service.ts` are never called.
- **Fix:** Use these in `routes/chat-context.ts` and `routes/messages.ts` instead of inline logic.

#### 1.4 Wire memory injection into generation pipeline

- **Problem:** `injectChatMemories()` is never called — memories are extracted but never injected into context.
- **Fix:** Call `injectChatMemories()` in `PromptAssembler.assemble()` or in `triggerAutoGeneration()` before prompt assembly.

#### 1.5 Wire context pruning

- **Problem:** `pruneMessages()` is never called — context windows grow unbounded.
- **Fix:** Call `pruneMessages()` in `PromptAssembler.assemble()` when context exceeds threshold.

#### 1.6 Wire auto-rename

- **Problem:** `generateRuleName()` and `buildRenamePrompt()` are never called — chats never auto-renamed.
- **Fix:** Call after first user message in `routes/messages.ts`.

#### 1.7 Wire transitions

- **Problem:** `detectTransitionType()` and `createTransition()` are never called.
- **Fix:** Call in message route when user message matches transition patterns.

### Phase 2: Security Fixes (High Value)

#### 2.1 Add ownership checks to character routes

- **Problem:** Any authenticated user can read/modify any character's mood, relationships, traits, licensing, availability, emotions, avatars.
- **Fix:** Add ownership check in each route handler — verify `actor.owner_id === userId` or `userRole === "admin"`.
- **Files:** `character-mood.ts`, `character-relationships.ts`, `character-traits.ts`, `character-licensing.ts`, `character-availability.ts`, `character-emotions.ts`, `character-avatars.ts`

#### 2.2 Fix message-reactions DELETE access check

- **Problem:** DELETE `/api/messages/:id/reactions` doesn't verify message access.
- **Fix:** Add access check before deletion.

#### 2.3 Fix SSRF in import route

- **Problem:** `import.ts` fetches arbitrary URLs from user input.
- **Fix:** Validate URL scheme (http/https only), block private IPs, add timeout.

#### 2.4 Fix server startup race

- **Problem:** `server.ts` calls `serve()` before `runMigrations()`.
- **Fix:** Move `runMigrations()` before `serve()`.

### Phase 3: Test Coverage (Moderate Value)

#### 3.1 Chat module tests (15 files, 0 tests)

- `src/chat/service.ts` — core CRUD, access checks
- `src/chat/context-window.ts` — token computation, thresholds
- `src/chat/memory-injection.ts` — injection logic
- `src/chat/memory-promotion.ts` — promotion pipeline
- `src/chat/pruning.ts` — scoring, pruning algorithm
- `src/chat/transitions.ts` — transition detection
- `src/chat/auto-rename.ts` — rule-based and LLM-based renaming
- `src/chat/moderation.ts` — permission checks
- `src/chat/hallucination-guard.ts` — entity detection
- `src/chat/response-length.ts` — preset resolution
- `src/chat/token-counter.ts` — token counting
- `src/chat/token-utils.ts` — token estimation
- `src/chat/random-events.ts` — random event generation

#### 3.2 Auth module tests (2 files, 0 tests)

- `src/auth/jwt.ts` — JWT sign/verify
- `src/auth/index.ts` — auth entry point

#### 3.3 Route tests for untested routes (13 files)

- `message-reactions.ts` — toggle, group, max reactions
- `chat-context.ts` — context state, regenerate
- `export.ts` — ZIP export, character/chat export
- `import.ts` — character card import
- `i18n.ts` — locale listing, user locale update
- `character-availability.ts` — upsert, delete
- `character-avatars.ts` — CRUD, selection
- `character-emotions.ts` — CRUD, emotion definitions
- `character-io.ts` — export/import character systems
- `character-licensing.ts` — upsert, delete
- `character-mood.ts` — CRUD, events
- `character-relationships.ts` — CRUD, events
- `character-traits.ts` — permanent/world/location traits
- `admin-character-overrides.ts` — admin overrides

#### 3.4 Other untested modules

- `src/telemetry/` (3 files) — event recording, cleanup
- `src/image-edit/` (4 files) — image editing pipeline
- `src/services/` (2 files) — server external manager

### Phase 4: De-duplication (Moderate Value)

#### 4.1 Consolidate message access checks

- Remove `assertChatAccess` and `requireMessageAccess` from `routes/messages.ts`
- Use `checkChatAccess` and `getMessageWithAccess` from `chat/service.ts`

#### 4.2 Consolidate message listing/variants

- Use `listMessages` and `getMessageVariants` from `chat/service.ts` in `routes/messages.ts`

#### 4.3 Consolidate context window logic

- Use `getChatContext` from `chat/service.ts` in `routes/chat-context.ts`

### Phase 5: Low Priority (Low Value)

- E2E tests (not passing, future patches needed)
- Task and epic closure (will be reconciled as stabilization is done)
- ESLint issues not impacting logic
- Frontend wirings (out of scope)

## Tickets to Create

| Ticket                               | Priority | Description                                                 |
| ------------------------------------ | -------- | ----------------------------------------------------------- |
| TASK-wire-gm-service-story-mode      | High     | Wire GameMasterService into story mode generation           |
| TASK-fix-turn-number-double-count    | High     | Fix turn number off-by-one in TurnManager/executeTurn       |
| TASK-wire-memory-injection           | High     | Call injectChatMemories in generation pipeline              |
| TASK-wire-context-pruning            | High     | Call pruneMessages in prompt assembly                       |
| TASK-wire-auto-rename                | High     | Call generateRuleName after first user message              |
| TASK-wire-transitions                | High     | Call detectTransitionType/createTransition in message route |
| TASK-add-ownership-checks-characters | High     | Add ownership checks to 7 character route files             |
| TASK-fix-message-reactions-access    | Medium   | Add message access check to reactions DELETE                |
| TASK-fix-import-ssrf                 | Medium   | Validate URL in import route                                |
| TASK-fix-server-startup-race         | Medium   | Move migrations before serve()                              |
| TASK-test-chat-module                | Medium   | Add tests for 15 chat module files                          |
| TASK-test-auth-module                | Medium   | Add tests for JWT and auth                                  |
| TASK-test-untested-routes            | Medium   | Add tests for 13 untested route files                       |
| TASK-test-telemetry-module           | Low      | Add tests for telemetry                                     |
| TASK-test-image-edit-module          | Low      | Add tests for image editing                                 |
| TASK-dedupe-message-access-checks    | Medium   | Consolidate duplicate access check logic                    |
| TASK-dedupe-message-listing          | Medium   | Use chat service listMessages/getMessageVariants            |
| TASK-dedupe-context-window           | Medium   | Use chat service getChatContext                             |

## Files Modified

- (To be updated as tickets are worked)

## Notes

- Ignore frontend wirings for now
- Create new tickets at low priority for items not addressed in this plan
- Follow common sense: functionality and features > docs and .plan
- Value priority: chat/memories/characters/assistant/nsfw > moderation/access/gallery/i18n > e2e tests/epics/eslint
