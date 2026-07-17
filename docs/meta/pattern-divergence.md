# Pattern Divergence Audit

Living document tracking where codebase diverges from documented patterns. Updated per audit sweep.

---

## 1. Factory Pattern Divergence

**Policy**: `recommendations.md` Section 16 — prefer `createXxx()` factory functions over `new Constructor(dep)`.

### 1.1 God Classes (SRP Violations >400 lines) — Resolved

Four god classes refactored to factory + dispatcher + registry pattern:

| Class               | Original                              | New structure                                                                                                           |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GameMasterService` | `src/story/game-master.ts` (555L)     | `src/story/gm/service.ts` + `src/story/gm/decisions/*.ts` + `registry.ts`                                              |
| `QuestEngine`       | `src/story/quest-engine.ts` (497L)    | `src/story/quest-engine.ts` + `src/story/quests/calculators/*` + `registry.ts`                                          |
| `QualityEvaluator`  | `src/story/quality-evaluator.ts` (505L) | `src/story/quality/index.ts` + `src/story/quality/scorers/*` + `registry.ts`                                          |
| `PromptAssembler`   | `src/assistant/prompt-assembler.ts` (509L) | `src/assistant/prompt-assembler.ts` + `src/assistant/prompt/sections/*` + `registry.ts`                              |

### 1.2 Remaining God Class

| Class             | File                           | Lines | Why Candidate |
| ----------------- | ------------------------------ | ----- | ------------- |
| `ConfigSchema`    | `src/config/schema-class.ts`   | 962   | defaults, env-map, validation, JSON schema gen |

### 1.3 Factory Candidates (no factory, no polymorphism need)

`WorldStateService` (326L), `ItemsService` (319L), `SyntheticGenerator` (302L), `TurnManager` (251L), `PersonasService` (124L), `ServerExternalManager` (407L), `ContextCompactor` (46L), `StreamingRepetitionDetector` (85L), `ActivityStreamer` (87L).

### 1.4 Good Examples (follow factory pattern)

`src/transport/factory.ts`, `src/logger/index.ts`, `src/middleware/rate-limit.ts`, `src/routes/entity-routes.ts`, `src/db/state.ts`, `src/assets/service.ts` (pure functions).

### 1.5 Member Order Inconsistency — Resolved

God-class refactors split into small per-dimension files with consistent field→constructor→method order.

---

## 2. Safe JSON Processing Divergence

**Policy**: `banned-patterns.md` Section 13 — no bare `JSON.parse`/`JSON.stringify` in production code. Use `safeJsonParse<T>()`, `jsonParseOr()`, `safeJsonStringify()` from `src/utils.ts`.

### 2.1 Server-Side Bare JSON.parse (risky)

| File                              | Line | Code                     | Status  |
| --------------------------------- | ---- | ------------------------ | ------- |
| `src/group-chat/turn-selector.ts` | 115  | `JSON.parse(storyState)` | Open    |

### 2.2 Server-Side Bare JSON.stringify — All Fixed

All server-side sites replaced with `safeJsonStringify`.

### 2.3 Frontend — All Fixed

`JSON.parse` → `jsonParseOr` completed. `JSON.stringify` → `jsonBody()` complete. Only remaining `JSON.stringify` is inside `src/frontend/alpine/json.ts` itself (the documented exception).

### 2.4 Barrel Bypass

3 files import from `../utils/safe-json` directly instead of `../utils`: `src/logger/formatters.ts`, `src/logger/limits.ts`, `src/frontend/alpine/transports/server.ts`.

### 2.5 Adoption Rate

| Domain                               | Following | Diverging | Rate |
| ------------------------------------ | --------- | --------- | ---- |
| Server routes                        | 9         | 0         | 100% |
| Server core                          | 6         | 1         | ~86% |
| Frontend (JSON.parse)                | 4         | 0         | 100% |
| Frontend (JSON.stringify → jsonBody) | 11        | 0         | 100% |
| Import style (barrel)                | 14        | 3         | ~82% |

---

## 3. State Machine Pattern Divergence

**Policy**: `recommendations.md` Section 3 — every lifecycle enum gets `StateDef` + `StateMachine` via `createMachine()`.

### 3.1 Framework Status

`src/db/state.ts`: `StateDef<S>` → `createMachine(def)` → `StateMachine<S>` with `canTransition`, `transition`, `isTerminal`, `isValid`. `CompositeValidator<A,B>` for multi-axis validation.

### 3.2 Defined State Machines (6 total)

4 of 5 defined machines are dead code. Only `syntheticDataStatusMachine` has a runtime consumer (`src/story/synthetic/generator.ts:81`).

### 3.3 Lifecycle Enums Missing StateDef

| Enum                  | Values                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| `UserStatus`          | active, disabled, deactivated                                              |
| `GenerationStatus`    | pending, processing, streaming, completed, failed, cancelled               |
| `QuestStatus`         | active, completed, failed, abandoned                                       |
| `QuestProgressStatus` | active, completed, failed, ignored                                         |
| `TurnStatus`          | pending, generating, evaluating, accepted, regenerating, failed, escalated |

### 3.4 Boolean Lifecycle Flags Not Yet Migrated

`actor_lore_entries.enabled` → `LoreEntryStatus`, `world_lore_entries.enabled` → `LoreEntryStatus`, `actor_keys.status` → `KeyStatus` (planned in `schema.md`).

### 3.5 Bare Enum Columns Not Wired to Schema

`world_items.visibility` (enum exists in `enums-story.ts:137`), `actor_keys.key_type` (not normalized).

### 3.6 Adoption Rate

| Metric                           | Count          |
| -------------------------------- | -------------- |
| Defined machines                 | 6              |
| Machines with runtime consumers  | 1 (16%)        |
| Lifecycle enums missing StateDef | 5              |
| Boolean flags awaiting migration | 2 (+2 partial) |

---

## 4. Other Pattern Violations

### 4.1 Boolean Flags as Function Parameters

- `src/logger/formatters.ts:27` — `formatConsole(entry, isColor?, mode?)`
- `src/routes/views.ts:95` — `respond(content, isHtmx, title?)`

### 4.2 `any` / `as any` Usage

~48 `as any` casts across ~17 files. Concentrated in frontend Alpine (~30 `globalThis as any`), `entity-routes.ts` (6 `database as any`), `db/index.ts` (3 `parameters as any[]`).

### 4.3 `void` Promise Without `.catch()` — All Fixed

All `void` promise sites resolved.

### 4.4 `console.*` in Production Code

1 violation: `src/frontend/alpine/queue.ts:91` — `console.error("[logger] transport write failed:", ...)`.

### 4.5 `||` for Defaults (Falsy Trap)

~68 instances across ~25 files. Concentrated in frontend Alpine code and route handlers.

---

## 5. Migration Priority

### High (crash risk, data integrity)

1. `src/group-chat/turn-selector.ts:115` — bare `JSON.parse` on DB field
2. `src/generation/cancellation-tracker.ts`, `cancellation-actions.ts` — 7 fire-and-forget DB writes
3. `src/generation/controller.ts` — 4 silent JSON parse errors

### Medium (inconsistent, growing divergence)

1. State machine wiring: add runtime `canTransition` guards in message routes
2. State machine definition: add `StateDef` for `UserStatus`, `GenerationStatus`, `QuestStatus`, `QuestProgressStatus`, `TurnStatus`

### Low (cleanup, consistency)

1. Factory refactor of `ConfigSchema` (962L)
2. `as any` reduction in `entity-routes.ts`, `db/index.ts`
3. Barrel bypass fix — 3 direct `safe-json` imports
4. Boolean flag migration — `enabled` → `LoreEntryStatus` in lore tables

---

## 6. Audit Process

- **Frequency**: Sweep per release cycle
- **Scope**: `src/` (exclude scripts, `json.ts` foundation, `*.test.ts`)
- **Method**: grep for patterns, class analysis, cross-reference enum definitions with state machine consumers