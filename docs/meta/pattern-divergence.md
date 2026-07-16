# Pattern Divergence Audit

Living document tracking where codebase diverges from its documented patterns.
Updated per audit sweep. Each section lists gap, location, severity, and migration
path.

---

## 1. Factory Pattern Divergence

**Policy**: `recommendations.md` Section 16 — prefer `createXxx()` factory functions
over `new Constructor(dep)` for service/feature modules with single implementation.

### 1.1 God Classes (SRP Violations >400 lines)

| Class                      | File                                            | Lines | Responsibilities                                         | Severity |
| -------------------------- | ----------------------------------------------- | ----- | -------------------------------------------------------- | -------- |
| `ConfigSchema`             | `src/config/schema-class.ts`                    | 962   | defaults data, env-map gen, validation, JSON schema gen  | High     |
| `OpenAiCompatibleProvider` | `src/generation/providers/openai-compatible.ts` | 442   | HTTP fetch, SSE parsing, retry, streaming, body building | Low      |

### 1.1.1 Resolved — Refactored to Factory + Dispatcher + Wrapper

The four god classes below were refactored. Each now follows the same shape: a
thin dispatcher, a `createXxx()` factory, and one small file per
dimension/type registered in an `xxxS` registry (e.g. `GM_DECISIONS`,
`PROGRESS_CALCULATORS`, `SCORERS`, `PROMPT_SECTIONS`). New behavior dimensions
are added by creating a file + one registry line — no edits to the core.

| Class               | Original                                   | New structure                                                                                                                  | Status   |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `GameMasterService` | `src/story/game-master.ts` (555L)          | `src/story/gm/service.ts` (dispatcher + factory) + `src/story/gm/decisions/{llm,hardcoded,human,hybrid}.ts` + `registry.ts`    | **Done** |
| `QuestEngine`       | `src/story/quest-engine.ts` (497L)         | `src/story/quest-engine.ts` (dispatcher + factory) + `src/story/quests/calculators/*` (7 progress calculators) + `registry.ts` | **Done** |
| `QualityEvaluator`  | `src/story/quality-evaluator.ts` (505L)    | `src/story/quality/index.ts` (dispatcher + factory) + `src/story/quality/scorers/*` (6 scorers) + `registry.ts`                | **Done** |
| `PromptAssembler`   | `src/assistant/prompt-assembler.ts` (509L) | `src/assistant/prompt-assembler.ts` (orchestrator) + `src/assistant/prompt/sections/*` (section builders) + `registry.ts`      | **Done** |

### 1.2 Factory Candidates (no factory, no polymorphism need)

| Class                         | File                                      | Lines | Why Candidate                            |
| ----------------------------- | ----------------------------------------- | ----- | ---------------------------------------- |
| `WorldStateService`           | `src/story/world-state.ts`                | 326   | Single consumer, no polymorphic contract |
| `ItemsService`                | `src/story/items.ts`                      | 319   | Same                                     |
| `SyntheticGenerator`          | `src/story/synthetic/generator.ts`        | 302   | Same                                     |
| `TurnManager`                 | `src/turning/turn-manager.ts`             | 251   | Same                                     |
| `PersonasService`             | `src/personas/service.ts`                 | 124   | Thin service, trivial refactor           |
| `ServerExternalManager`       | `src/services/server-external-manager.ts` | 407   | Multiple inline process management       |
| `ContextCompactor`            | `src/generation/context-compactor.ts`     | 46    | Simple wrapper                           |
| `StreamingRepetitionDetector` | `src/generation/repetition-detector.ts`   | 85    | Simple wrapper                           |
| `ActivityStreamer`            | `src/routes/activity-stream.ts`           | 87    | SSE per-user stream                      |

### 1.3 Good Examples (follow factory pattern)

- `src/transport/factory.ts` — `createProtocol()` dispatch
- `src/transport/http1.ts` — `createHttp1Handler()`
- `src/transport/h2.ts` — `createH2Handler()`
- `src/transport/ws.ts` — `createWsHandler()`
- `src/logger/index.ts` — `createLogger()`
- `src/middleware/rate-limit.ts` — `createRateLimiter()`
- `src/routes/entity-routes.ts` — `createEntityRoutes()`
- `src/db/state.ts` — `createMachine()`
- `src/assets/service.ts` — pure functions (even better)

### 1.4 Member Order Inconsistency

Convention (unwritten): `fields → constructor → methods`.

Resolved by the god-class refactors — `GameMasterService` and `QualityEvaluator`
were split into small per-dimension files with consistent member order.
Remaining violations (if any) are in non-god-class modules and low priority.

---

## 2. Safe JSON Processing Divergence

**Policy**: `banned-patterns.md` Section 13 — no bare `JSON.parse`/`JSON.stringify`
in production code. Use `safeJsonParse<T>()`, `jsonParseOr()`, `safeJsonStringify()`
from `src/utils.ts`.

### 2.1 Server-Side Bare JSON.parse (risky — crash on malformed DB data)

| File                                | Line | Code                     | Fix                                     | Status    |
| ----------------------------------- | ---- | ------------------------ | --------------------------------------- | --------- |
| `src/group-chat/turn-selector.ts`   | 115  | `JSON.parse(storyState)` | `jsonParseOr(storyState, defaultState)` | **Open**  |
| `src/assistant/prompt-assembler.ts` | 78   | `JSON.parse(raw)`        | `jsonParseOr(raw, [])`                  | **Fixed** |

### 2.2 Server-Side Bare JSON.stringify (data loss risk)

All server-side bare `JSON.stringify` sites have been replaced with `safeJsonStringify`:

| File                                  | Line(s) | Code                                  | Status    |
| ------------------------------------- | ------- | ------------------------------------- | --------- |
| `src/routes/settings.ts`              | 142-145 | `JSON.stringify(settings, null, 2)`   | **Fixed** |
| `src/routes/activity-stream.ts`       | 30, 54  | `JSON.stringify(data)`                | **Fixed** |
| `src/routes/chats.ts`                 | 905     | `JSON.stringify(exportData, null, 2)` | **Fixed** |
| `src/generation/image-gen-route.ts`   | 55, 83  | `JSON.stringify(body)`                | **Fixed** |
| `src/generation/generation-routes.ts` | 350     | `JSON.stringify({ error: ... })`      | **Fixed** |

### 2.3 Frontend Bare JSON Usage

Frontend has its own safe JSON module (`src/frontend/alpine/json.ts` with
`safeJsonParse`, `safeJsonStringify`, `jsonParseOr`, `jsonBody`).

**Fixed** — bare `JSON.parse` replaced with `jsonParseOr`:

| File                                      | Line(s)       | Status    |
| ----------------------------------------- | ------------- | --------- |
| `src/frontend/alpine/notifications.ts`    | 84            | **Fixed** |
| `src/frontend/alpine/htmx.ts`             | 146           | **Fixed** |
| `src/frontend/alpine/chat-management.ts`  | 129, 153, 262 | **Fixed** |
| `src/frontend/alpine/chat-generations.ts` | 46            | **Fixed** |

**Remaining** — `JSON.stringify` → `jsonBody()` migration complete. The only
remaining `JSON.stringify` in frontend code is inside `src/frontend/alpine/json.ts`
itself (the `safeJsonStringify` foundation — the documented exception from
`banned-patterns.md`). Four of the originally listed files (`new-chat.ts`,
`worlds.ts`, `characters.ts`, `browser.ts`) no longer exist; `admin.ts`,
`personas.ts`, and `settings.ts` were already migrated. The last two
nested-serialization sites (`world-edit.ts:73`, `chat-management.ts:255`) are
now migrated to `jsonBody`.

### 2.4 Barrel Bypass (minor)

3 files import from `../utils/safe-json` directly instead of `../utils`:

- `src/logger/formatters.ts`
- `src/logger/limits.ts`
- `src/frontend/alpine/transports/server.ts`

### 2.5 Adoption Rate Summary

| Domain                               | Following | Diverging | Rate |
| ------------------------------------ | --------- | --------- | ---- |
| Server routes                        | 9         | 0         | 100% |
| Server core                          | 6         | 1         | ~86% |
| Frontend (JSON.parse)                | 4         | 0         | 100% |
| Frontend (JSON.stringify → jsonBody) | 11        | 0         | 100% |
| Import style (barrel)                | 14        | 3         | ~82% |

---

## 3. State Machine Pattern Divergence

**Policy**: `recommendations.md` Section 3 — every lifecycle enum gets a `StateDef`
and `StateMachine` via `createMachine()`. Guard transitions at service boundary.

### 3.1 Framework Status

`src/db/state.ts`: `StateDef<S>` → `createMachine(def)` → `StateMachine<S>` with
`canTransition`, `transition`, `isTerminal`, `isValid`. `CompositeValidator<A,B>`
for multi-axis validation. Implementation is clean and complete.

### 3.2 Defined State Machines (5 total)

| Machine                      | File                 | Used in production?                             |
| ---------------------------- | -------------------- | ----------------------------------------------- |
| `messageStatusMachine`       | `enums-core.ts:144`  | **NO** — no caller ever checks transitions      |
| `messageVisibilityMachine`   | `enums-core.ts:159`  | **NO**                                          |
| `messageCompositeValidator`  | `enums-core.ts:162`  | **NO**                                          |
| `actorVisibilityMachine`     | `enums-core.ts:195`  | **NO**                                          |
| `itemVisibilityMachine`      | `enums-story.ts:156` | **NO**                                          |
| `syntheticDataStatusMachine` | `enums-story.ts:171` | **YES** — `SyntheticGenerator.transitionStatus` |

4 of 5 defined machines are dead code. Only `syntheticDataStatusMachine` has a
runtime consumer (`src/story/synthetic/generator.ts:81`).

### 3.3 Lifecycle Enums Missing StateDef

These enums model lifecycle state (multiple values, clear transitions) but have
no `StateDef`:

| Enum                  | Values                                                                     | Example Transition Rule                      |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| `UserStatus`          | active, disabled, deactivated                                              | active ↔ disabled, active → deactivated      |
| `GenerationStatus`    | pending, processing, streaming, completed, failed, cancelled               | pending → processing → streaming → completed |
| `QuestStatus`         | active, completed, failed, abandoned                                       | active → completed/failed/abandoned          |
| `QuestProgressStatus` | active, completed, failed, ignored                                         | active → completed/failed/ignored            |
| `TurnStatus`          | pending, generating, evaluating, accepted, regenerating, failed, escalated | pending → generating → evaluating → accepted |

### 3.4 Boolean Lifecycle Flags Not Yet Migrated

From `docs/spec/schema.md` migration plan:

| Table                | Column    | Current             | Target                 | Status                       |
| -------------------- | --------- | ------------------- | ---------------------- | ---------------------------- |
| `actor_lore_entries` | `enabled` | `INTEGER DEFAULT 1` | `LoreEntryStatus` enum | Planned (schema.md line 114) |
| `world_lore_entries` | `enabled` | `INTEGER DEFAULT 1` | `LoreEntryStatus` enum | Planned (schema.md line 129) |
| `actor_keys`         | `status`  | `text` (bare)       | `KeyStatus` enum       | Planned (schema.md line 38)  |

### 3.5 Bare Enum Columns Not Wired to Schema

| Table                    | Column       | Enum exists?                             | Schema constraint? |
| ------------------------ | ------------ | ---------------------------------------- | ------------------ |
| `world_items.visibility` | `visibility` | `ItemVisibility` at `enums-story.ts:137` | Bare `text` in DDL |
| `actor_keys.key_type`    | `key_type`   | Partial (`key_type` not yet normalized)  | Bare `text`        |

### 3.6 Adoption Rate Summary

| Metric                           | Count          |
| -------------------------------- | -------------- |
| Defined machines                 | 6              |
| Machines with runtime consumers  | 1 (16%)        |
| Lifecycle enums missing StateDef | 5              |
| Boolean flags awaiting migration | 2 (+2 partial) |

---

## 4. Other Pattern Violations (from Audit Sweep)

### 4.1 Boolean Flags as Function Parameters

**Banned pattern**: `recommendations.md` Section 2 — functions with 3+ params use
options-object.

| File                       | Line | Signature                                                |
| -------------------------- | ---- | -------------------------------------------------------- |
| `src/logger/formatters.ts` | 27   | `formatConsole(entry, isColor?: boolean, mode?: "ansi")` |
| `src/routes/views.ts`      | 95   | `respond(content, isHtmx: boolean, title?)`              |

### 4.2 `any` / `as any` Usage

`as any` casts: ~48 instances across ~17 files. Concentrated in:

- `src/frontend/pages/` and `src/frontend/alpine/`: ~30 `(globalThis as any)` —
  serialization-boundary exception, but pervasive.
- `src/routes/entity-routes.ts`: 6 `const db = database as any` — masks Kysely
  type mismatches in generic CRUD handler.
- `src/db/index.ts`: 3 `parameters as any[]` in dialect wrapper.
- `src/routes/world-lore-entries.ts`: `const d = db as any`.

Plain `any` type annotations: ~18 instances in frontend Alpine code
(`src/frontend/alpine/types.ts`, `chat-management.ts`, `chat-utils.ts`,
`new-chat.ts`, `settings.ts`).

### 4.3 `void` Promise Without `.catch()`

Fixed sites wrapped in `void (async () => { try { await ... } catch {} })()`:

| File                                      | Line(s)     | Status    |
| ----------------------------------------- | ----------- | --------- |
| `src/logger/queue.ts`                     | 48, 89, 133 | **Fixed** |
| `src/frontend/alpine/queue.ts`            | 38, 70, 102 | **Fixed** |
| `src/frontend/alpine/notifications.ts`    | 148         | **Fixed** |
| `src/frontend/alpine/chat-generations.ts` | 36          | **Fixed** |
| `src/tui/asset-view.ts`                   | 147         | **Fixed** |

**Remaining:** none — all `void` promise sites resolved.

| File                                       | Line | Code                             | Status    |
| ------------------------------------------ | ---- | -------------------------------- | --------- |
| `src/services/external-server-utils.ts`    | 44   | `void server.stop()`             | **Fixed** |
| `src/services/server-external-manager.ts`  | 359  | `void this.checkAllLiveliness()` | **Fixed** |
| `src/frontend/alpine/transports/server.ts` | 53   | `void this.flush()`              | **Fixed** |
| `src/db/migrations.test.ts`                | 93   | `void kysely.destroy()`          | **Fixed** |

### 4.4 `console.*` in Production Code

1 violation in frontend production path:

| File                           | Line | Code                                                     |
| ------------------------------ | ---- | -------------------------------------------------------- |
| `src/frontend/alpine/queue.ts` | 91   | `console.error("[logger] transport write failed:", ...)` |

14 other `console.*` instances in scripts (`version-bump.ts`, `commit-check.ts`)
— acceptable exception per policy.

### 4.5 `||` for Defaults (Falsy Trap)

~68 instances across ~25 files. Most concentrated in:

- Frontend Alpine code (`new-chat.ts`, `chat-utils.ts`, `chat-messages.ts`)
- Route handlers (`views.ts`, `characters.ts`)
- UI utilities (`ui.ts`, `gallery-upload.ts`)

---

## 5. Migration Priority

### Priority: High (crash risk, data integrity)

1. ~~Frontend bare `JSON.parse` on SSE data — `notifications.ts:84`, `chat-generations.ts:46`~~ **Fixed**
1. ~~Server bare `JSON.parse` on DB fields — `prompt-assembler.ts:78`~~ **Fixed**
1. ~~`void` promise without `.catch()` in logger queue — `src/logger/queue.ts:48,89,133`~~ **Fixed**
1. Server bare `JSON.parse` on DB fields — `turn-selector.ts:115` **Open**

### Priority: Medium (inconsistent, growing divergence)

1. Frontend bare `JSON.stringify` migration to `jsonBody()` — 10 files
1. ~~Server bare `JSON.stringify` in routes — 5 files~~ **Fixed**
1. State machine wiring: add runtime `canTransition` guards in message routes
1. State machine definition: add `StateDef` for `UserStatus`, `GenerationStatus`,
   `QuestStatus`, `QuestProgressStatus`, `TurnStatus`
1. ~~Remaining `void` promise sites — 4 instances (server services, transports)~~ **Done**

### Priority: Low (cleanup, consistency)

1. ~~Factory refactor of god classes — `GameMasterService`, `QuestEngine`, `QualityEvaluator`, `PromptAssembler`~~ **Done**
1. Factory refactor of remaining god class — `ConfigSchema` (962L)
1. Member order fix — `GameMasterService`, `QualityEvaluator`
1. `as any` reduction in `entity-routes.ts` and `db/index.ts`
1. Barrel bypass fix — 3 direct `safe-json` imports
1. Boolean flag conversion — `enabled` → `LoreEntryStatus` in lore tables

---

## 6. Audit Process

- **Frequency**: Sweep per release cycle or per major refactor
- **Scope**: `src/` (exclude `src/scripts/`, `src/frontend/alpine/json.ts` foundation, `*.test.ts`)
- **Method**: grep for bare `JSON.parse`/`JSON.stringify`, class analysis for factory
  pattern, cross-reference enum definitions with state machine consumers
- **Tooling**: `rg "JSON\.(parse|stringify)\(" src/ --type ts`, `rg "class " src/ --type ts`,
  `rg "createMachine" src/ --type ts`
