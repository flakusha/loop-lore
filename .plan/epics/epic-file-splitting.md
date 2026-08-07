# EPIC: File Splitting & God-Module Refactor

**Status:** 🟡 In Progress
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

- [ ] Split `src/chat/service.ts` (1830L) into `src/chat/service/` barrel + domain modules
- [ ] Split `src/routes/views.ts` (1524L) into view-domain route modules
- [ ] Split `src/routes/messages.ts` (1121L) into `src/routes/messages/` (aligns TASK-split-messages-route)
- [ ] Split `src/generation/auto-gen.ts` (1119L) into pipeline step modules
- [ ] Split `src/routes/admin.ts` (1091L) into admin domain modules
- [ ] Split `src/assets/service.ts` (732L)
- [ ] Split `src/routes/worlds.ts` (765L)
- [ ] Split `src/routes/characters.ts` (553L)
- [ ] Convert class-based services (`characters/services/*`) to interface-merged factory + `thisL`
- [ ] Apply derived-type single-source-of-truth where public types are hand-rolled in parallel
- [ ] Close `size:strict` debt: 0 files remain >250L → promote `check-file-size.ts` to blocking CI gate

## Files

- `scripts/check-file-size.ts` — size guard (already excludes tests/migrations/generated)
- `src/chat/service.ts`, `src/routes/{views,messages,admin,worlds,characters}.ts`,
  `src/generation/auto-gen.ts`, `src/assets/service.ts`, `src/validation/schemas.ts` (976L)
- Patterns reference: `src/generation/auto-gen.ts` (AutoGenOpts/GenDeps/createDefaultDeps)

## Acceptance Criteria

- [ ] `bun run check` passes; `size:strict` reports 0 files over 250L (excluding tests/migrations/generated)
- [ ] No behavior change (pure refactor) — full unit + e2e suites pass
- [ ] Every split preserves the external import surface via a barrel re-export
- [ ] `bun run dead:code` still exits 0 (no orphaned exports left behind)
- [ ] Class converts preserve behavior; type-source single-truth where interfaces were parallel
