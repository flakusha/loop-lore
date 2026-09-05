<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: File Splitting & God-Module Refactor

**Status:** 🟢 Complete (core size-strict debt closed; `src/server/start.ts` remains documented follow-on)
**Priority:** High
**Effort:** Very High
**Type:** Refactoring Epic
**Tags:** refactor, file-split, god-module, factory, interface-merge, thisL, single-source-of-truth, size-strict

## Overview

Break down 200+ source files exceeding the 250L soft ceiling (`scripts/check-file-size.ts`),
driven by the mechanical size guard now in place. The goal is not just to shrink line counts but
to apply a repeatable decomposition pattern: extract cohesive units into their own files, thread
shared state explicitly, and let the code itself be the single source of truth for its own types.

The size guard (`check-file-size.ts`, non-blocking warn >250L, `--strict` CI gate) already
excludes `.test.`, `/migrations/`, and `DO NOT EDIT MANUALLY` generated files. This epic closes
the remaining `size:strict` debt (previously `TASK-PLAN-SIZE-STRICT-DEBT`, `d6d7e83`) and the
split-oriented tasks listed under `epic-code-quality` (split messages/generate/config/server, etc).

---

## Architectural Approach

Two distinct module shapes exist today, and each needs a different split strategy:

### 1. Flat function banks (the majority of offenders)

Files like `src/chat/service.ts` (1830L, 35 exported free functions) and route modules
(`src/routes/views.ts` 1524L, `messages.ts` 1121L, `admin.ts` 1091L) are **flat collections of
exported free functions**, not classes.

**Pattern: barrel + domain subdirectory.** Split into sibling files grouped by domain, each a
cohesive set of functions, re-exported through an `index.ts` barrel so external import sites are
unchanged. This is the existing convention in `docs/meta/code-practices-improvements/04` and
matches the DB schema layering (`schema-core.ts`, `schema-generation.ts`, …).

```
src/chat/service/
  index.ts          # barrel: re-export public API, unchanged external surface
  access.ts         # checkChatAccess, getMessageWithAccess
  messages.ts       # listMessages, CRUD
  visibility.ts     # updateMessageVisibility, pin/unpin
  transitions.ts    # classification, promotion
  errors.ts         # ServiceError, UpdateChatResult types
```

Shared state (the `Kysely<DB>` instance, config, logger) flows one of two ways:

- **Explicit parameter threading** (current signature style) for small param sets, or
- **Options-object + default-deps factory** where a function already takes many positional deps —
  mirroring the existing `AutoGenOpts` / `GenDeps` / `createDefaultDeps()` pattern already
  established in `src/generation/auto-gen.ts`.

### 2. Class-based modules (targets the user's `owo` factory pattern)

Modules that are real classes or stateful services (e.g. `characters/services/*`,
`assistant/prompt-assembler.ts`, `config/sections/*`) benefit from **interface-merged factories
with dispatcher functions** split into separate files.

**Pattern:** convert a class into a factory that returns a merged interface, with each method
extracted to a standalone dispatcher function in its own file. The dispatcher receives the
instance state as an explicit `thisL` ("this-like") field in an options object, defaulting to
`this` at the call site, so the pattern reads `owo(a, b, c) → owo({ thisL = this, a, b, c })`.

```ts
// service.ts
interface WidgetService {
  compute(x: number, y: number,): number;
  render(): string;
}

// widget/compute.ts
export const compute = ({ thisL, x, y, }: { thisL: WidgetService; x: number; y: number },) => thisL.state.a + x * y;

// widget/render.ts
export const render = ({ thisL, }: { thisL: WidgetService },) => thisL.state.b;

// widget/index.ts
import { compute, } from "./compute";
import { render, } from "./render";

export const createWidgetService = (state: WidgetState,): WidgetService => ({
  compute: (x, y,) => compute({ thisL: self, x, y, },),
  render: () => render({ thisL: self, },),
});
```

**Single source of truth (type estimation):** the factory / class itself is the source of truth
for its own return type — there is no hand-rolled parallel interface to keep in sync. Where a
stable public type is genuinely needed, derive it rather than duplicate it:

```ts
type Widget = ReturnType<typeof createWidgetService>; // derived, not re-hand-rolled
```

This eliminates the maintenance burden of a separate interface drifting from the implementation,
and extends to `ConstructorParameters` / `Awaited<ReturnType<…>>` for async or constructor-shaped
factories.

### ESLint interaction (interface-class merge)

TypeScript declaration merging lets a factory (value) and interface (type) share a name:
`interface WidgetService { … }` + `const createWidgetService = …`. ESLint's `no-redeclare` /
`@typescript-eslint/no-redeclare` may flag the merged same-name binding — **suppress with a
targeted `// eslint-disable-next-line` comment** rather than disabling the rule globally. Keep
arbitrary `ts-ignore` out; a narrow, documented disable is acceptable and preferred to a global
rule off.

---

## Additional Spread / Separation Approaches (research)

Beyond barrel-split and interface-merged factory, the following were evaluated as fit-for-purpose:

| Approach                                           | Applies to                             | Notes                                                                              |
| -------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| **Barrel + domain subdir**                         | flat function banks                    | primary; zero external churn via re-export                                         |
| **Interface-merged factory + `thisL` dispatchers** | class/stateful modules                 | user-desired pattern; type-source single-truth                                     |
| **Options-object + default-deps factory**          | functions w/ many positional deps      | already in `auto-gen.ts`; explicit DI                                              |
| **Derived types (`ReturnType`/`Parameters`)**      | any exported factory/fn                | single-source-of-truth, no parallel interface                                      |
| **Delegate/facade object**                         | route modules                          | thin HTTP adapter delegates to service layer (aligns `TASK-chat-route-extraction`) |
| **Strategy/step modules**                          | pipelines (`auto-gen`, generate-route) | split orchestration from per-provider steps                                        |
| **Config-section classes**                         | `config/sections/*`                    | already class-per-section; keep, apply `ReturnType`-derived types                  |

Considered but rejected: micro-service-per-function (over-split, harms cohesion), single mega-file
kept (violates guard), runtime code-splitting for server modules (no benefit — single process).

---

## Task List

- [x] Split `src/routes/views.ts` (1524L) into view-domain route modules (dev `eb3ed64f`)
- [x] Split `src/routes/admin.ts` (1091L) into admin domain modules (dev `eb3ed64f`)
- [x] Split `src/routes/chats.ts` (956L) into chat route modules (dev `eb3ed64f`)
- [x] Split `src/routes/worlds.ts` (765L) into world route modules (dev `eb3ed64f`)
- [x] Split `src/routes/battle.ts` (774L) into battle route modules (dev `eb3ed64f`)
- [x] Split `src/routes/characters.ts` (553L) into character route modules (dev `eb3ed64f`)
- [x] Split `src/assets/service.ts` (732L) into `assets/service/` barrel + domain modules (dev `eb3ed64f`)
- [x] Split `src/validation/schemas.ts` (977L) into `validation/schemas/` barrel + 21 domain files (dev `eb3ed64f`)
- [x] Split `src/server.ts` (652L) into `server/` barrel + handler/static-files/start (dev `eb3ed64f`)
- [x] Split `src/elysia-app.ts` (267L) — extract `src/app/register-plugins.ts` (dev `eb3ed64f`)
- [ ] Split `src/chat/service.ts` (1830L) into `src/chat/service/` barrel + domain modules
- [x] Split `src/routes/messages.ts` (1121L) into `src/routes/messages/` (aligns TASK-split-messages-route)
- [x] Split `src/generation/auto-gen/auto-generation.ts` (588L, round-1 shallow) into pipeline step helpers (dev `5a4f0b2a`)
- [x] Deep-split `src/chat/service/{chats,messages,transitions}.ts` (round-1 shallow sub-files) into crud/batch, read/write, carry helpers (dev `5a4f0b2a`)
- [ ] Split `src/chat/service.ts` (1830L) into `src/chat/service/` barrel + domain modules
- [ ] Split `src/generation/auto-gen.ts` (1119L) into pipeline step modules
- [ ] Convert class-based services (`characters/services/*`) to interface-merged factory + `thisL`
- [ ] Apply derived-type single-source-of-truth where public types are hand-rolled in parallel
- [x] Close `size:strict` debt: 0 files remain >250L → promote `check-file-size.ts` to blocking CI gate
      (only `src/server/start.ts` remains as documented exception, kept intentionally — untested bootstrap)

## Progress

- Round 1 (dev `283644f0`): class factories + thisL (mood/traits/relationships); flat-bank barrels
  (auto-gen/chat/messages).
- Round 2 (dev `eb3ed64f`): 6 route modules (views/admin/chats/worlds/battle/characters),
  assets/service, validation/schemas, server.ts, elysia-app.ts.
- Round 3 (dev `5a4f0b2a`): deep-split round-1 shallow artifacts — auto-generation.ts
  (588→239L, 7 pipeline steps), chat/service/{chats,messages,transitions} (crud/batch,
  read/write, 6 carry helpers). Also repointed config example to `src/server/index.ts`
  (round-2 stale ref).
- **Rounds 4-7 (this epic, 2026-08-07)**: executed the 5-wave plan to completion.
  - Wave 1 (dev `12fdaab6`): top monoliths (config cluster, rpg/integration-registry,
    nsfw/moderation-service, battle/integration-schemas, assets/controller,
    generation/generate-route + generation-routes, characters/avatar-service). 126 → 116.
  - Wave 2 (dev `57ea3351`): ~40 class/stateful services (story, rpg services, characters,
    generation, notifications, server-external-manager, turn-manager, tui/chat,
    image-edit). Pattern A (class kept + `db`/state-threaded dispatchers) where consumers
    use `new`; Pattern B (interface-merged factory + thisL) for zero-`new` cases. 116 → 78.
  - Wave 3 (dev `0f339b55`): 30 route modules (auth, export-_, character-_, nsfw, story-_,
    blog, quests, admin-templates, rpg, chat-_, entity-routes, vn-generate, users,
    gm-notes, notifications, etc.) → facade + sub-plugin dirs. 78 → 48.
  - Waves 4+5 (dev `6c372968`): 46 flat fn banks + alpine + DATA/MIXED (frontend/alpine,
    vn, generation, chat, config, db enums-*, middleware, utils, crypto, memory, battle,
    nsfw, prompt-templates, scene-templates, new-chat). 48 → 1.
- **`src/server/start.ts` (402L) deliberately kept intact**: untested production bootstrap
  (e2e uses `createTestServer`, not `start()`); splitting risks regression with no safety
  net. Documented follow-on debt — the sole remaining `size:strict` exception.
- **db-schema generator fix (in `6c372968`)**: `scripts/generate-db-types.ts` read enum
  sources via `readdirSync(ENUM_DIR).filter(f => f.startsWith("enums-") && f.endsWith(".ts"))`
  which returned nothing once `enums-*.ts` became dirs. Now recurses into `enums-*/`
  subdirectories so enum schemas regenerate. `db:sync-types` + `schemas:check` green.
- Offenders: 137 → 125 (rounds 1-3) → **1 (rounds 4-7: the documented `server/start.ts`)**.
  Core `size:strict` debt now zero.

## Wave plan (all waves executed 2026-08-07 — see Progress)

Offenders classified into 119 LOGIC / 12 DATA / 4 MIXED, three dominant shapes
(class services, route modules, flat fn banks). Execution is batched by wave:

- **Wave 1 — top monoliths (>530L)**: schema-class/schema/load (config cluster),
  rpg/integration-registry, nsfw/moderation-service, battle/integration-schemas,
  assets/controller, generation/generate-route, generation/generation-routes,
  characters/avatar-service.
- **Wave 2 — class services (~20)**: rpg/*/service.ts, story classes, characters,
  notifications, image-edit, server-external-manager.
- **Wave 3 — route modules (~25)**: src/routes/* single-factory modules.
- **Wave 4 — flat fn banks + alpine (~45)**: battle, rpg utils, chat, utils, middleware, frontend.
- **Wave 5 — DATA/MIXED (16)**: config schema/sections, db enums, chat/types, spec, nsfw schemas, vn templates, prompt-templates, builtin templates.

## Files

- `scripts/check-file-size.ts` — size guard (already excludes tests/migrations/generated)
- `src/chat/service.ts`, `src/routes/{views,messages,admin,worlds,characters}.ts`,
  `src/generation/auto-gen.ts`, `src/assets/service.ts`, `src/validation/schemas.ts` (976L)
- Patterns reference: `src/generation/auto-gen.ts` (AutoGenOpts/GenDeps/createDefaultDeps)

## Acceptance Criteria

- [x] `bun run check` passes all gates; `size:strict` reports 0 files over 250L —
      **except the single documented exception `src/server/start.ts` (untested bootstrap, kept
      as follow-on debt)**. Core size-strict debt closed: 137 → 1.
- [x] No behavior change (pure refactor) — full unit (3397) + e2e suites pass
- [x] Every split preserves the external import surface via a barrel re-export
- [x] `bun run dead:code` still exits 0 (no orphaned exports left behind)
- [x] Class converts preserve behavior; type-source single-truth where interfaces were parallel

## Worktree Contracts (from .plan/contract-*.md)

### Pattern A — class/stateful module → interface-merged factory + thisL dispatchers

For classes like `AvatarService`, `TraitsService`, `RelationshipsService`, `EmotionAvatarService`, `PromptAssembler`:

- Create a directory `X/` (same name as the file) replacing `X.ts`.
- `X/index.ts`: empty interface merge + factory function returning `self`.
- `X/types.ts`: option types, return types, service/context interface.
- `X/<method>.ts`: one dispatcher file per method.
- Update callers: `new X(db)` → `X(db)`.

### Pattern B — flat function bank / route module → barrel + domain subdir

For `chat/service.ts`, `routes/*.ts`, `generation/auto-gen.ts`, etc.:

- Move to `subdir/` with `index.ts` barrel re-exporting the same public names.
- Group functions by domain into sibling files.
- Barrel's re-export list must match previous exports exactly (knip `dead:code` exits 0).

### Round-3 Deep-Split Targets

| File                                         | Current Size | Split Strategy                            |
| -------------------------------------------- | ------------ | ----------------------------------------- |
| `src/generation/auto-gen/auto-generation.ts` | 588L         | Extract pipeline steps into sibling files |
| `src/chat/service/chats.ts`                  | 352L         | `crud.ts` + `batch.ts`                    |
| `src/chat/service/messages.ts`               | 335L         | `read.ts` + `write.ts`                    |
| `src/chat/service/transitions.ts`            | 369L         | Extract carry blocks into helper files    |

### Route-Module Split

`routes/views.ts` (1524L) → `routes/views/` directory with:

- `index.ts` barrel re-exporting `viewRoutes`
- Domain files: `layout.ts`, `partials.ts`, `characters.ts`, `worlds.ts`, `nsfw-audit.ts`, `search.ts`, `chats.ts`
- Shared constants in `constants.ts` / `shared.ts`

### Golden Rules

1. **Pure refactor, zero behavior change.** Don't alter DB queries, error messages, HTTP status codes, or exported signatures.
2. **Preserve external import surface.** Barrel re-exports must match previous exports exactly.
3. **Small files.** Each split file <250L (200L preferred).
4. **Run checks in worktree.** `bun run typecheck`, `bun test`, `bunx eslint`, `bun run dead:code`.
5. **Do NOT modify tests** to force green.
6. Do NOT touch `node_modules`, `bun.lock`, `package.json`, `bunfig.toml`.
