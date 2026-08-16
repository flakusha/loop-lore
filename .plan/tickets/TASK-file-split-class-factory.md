<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-file-split-class-factory: Convert class/stateful services to interface-merged factories (thisL)

**Status**: open
**Priority**: medium
**Labels**: refactor, factory, interface-merge, thisL
**Assignee**:
**Epic**: epic-file-splitting
**Related**: TASK-file-split-chat-service

## Description

Apply the **interface-merged factory + dispatcher-function** pattern to class/stateful modules.
Targets include `src/characters/services/*` (AvatarService, MoodService, RelationshipsService,
TraitsService, EmotionAvatarService), `src/assistant/prompt-assembler.ts`, and
`src/config/sections/*`.

## Approach

Convert each class into a factory returning a merged interface, with each method extracted to a
standalone dispatcher function in its own file. The dispatcher receives instance state as an
explicit `thisL` (this-like) field in an options object, defaulting to `this` at the call site:

```
class Owo { m(a, b) { … } }        →   owo({ thisL = this, a, b }) dispatchers
```

Structure:

```
characters/services/avatar/
  service.ts      # createAvatarService(deps) factory
  create.ts       # export const create = ({thisL, …}) => …
  read.ts
  update.ts
  types.ts        # derived types only (ReturnType<typeof createAvatarService>)
```

- A factory (value) and interface (type) may share a name via TS declaration merging; if ESLint
  `no-redeclare` flags it, suppress with a targeted `// eslint-disable-next-line` comment — do
  NOT disable the rule globally.
- **Single source of truth:** let the factory/class be the type source; derive public types with
  `ReturnType`/`Awaited<ReturnType>`/`Parameters` rather than maintaining a parallel hand-rolled
  interface.

## Acceptance Criteria

- [ ] Each converted module: dispatch bodies split into per-file functions using `thisL`
- [ ] Public API of each converted service unchanged at import sites
- [ ] No parallel hand-rolled interface duplicates a derived type
- [ ] `bun run check` passes; existing service tests pass (no behavior change)

## Notes

Verify ESLint behavior for interface+factory same-name merge before bulk-applying; capture the
disable-comment convention in the epic.

**Progress (2026-08-07, worktree file-split-refactor):**

- ✅ `MoodService` → factory + `thisL` dispatchers (commit `f51c3c64`)
- ✅ `TraitsService` → factory + `thisL` dispatchers (commit `49697451`)
- ✅ `RelationshipsService` → factory + `thisL` dispatchers (commit `5829166b`)
- All three: `bun run typecheck` green, service + dependent route tests pass, ESLint 0 errors.
- ESLint on the empty merge interface: `@typescript-eslint/no-empty-object-type` → suppressed
  with a targeted `// eslint-disable-next-line` (verified `no-redeclare` does NOT fire).

**BLOCKED — `AvatarService` / `EmotionAvatarService` (do NOT convert with factory):**
`src/characters/services/emotion-avatar-service.test.ts` (lines 133, 138) prototypes-mocks
`AvatarService.prototype.createAvatar` (stub/restore around `EmotionAvatarService` batch tests).
A factory value has no usable `.prototype`, so converting `AvatarService` breaks that test seam;
`EmotionAvatarService` also constructs `new AvatarService(this.db)` internally. Converting both
requires reworking the prototype-mock to injection — do NOT modify the test to force green.
Defer until a dependency-injection seam replaces the prototype mock.
