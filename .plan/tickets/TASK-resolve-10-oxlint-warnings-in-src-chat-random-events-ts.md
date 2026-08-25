<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Resolve 10 oxlint warnings in `src/chat/random-events.ts`

**Status:** 🟡 Deferred
**Severity:** Low
**Priority:** Low
**Type:** TASK
**Epic:** epic-tooling-check-gates
**Effort:** Small
**Files:** `src/chat/random-events.ts`

## Summary

`bunx oxlint src/chat/random-events.ts` reports 10 warnings on the
`generateRandomEvent` and `resolveTemplate` / `pickRandom` helpers (lines
167-220):

```
src/chat/random-events.ts:167:50: warning eslint(no-magic-numbers): No magic number: 999
src/chat/random-events.ts:171:14: warning eslint(id-length): Identifier name is too short (< 2).
src/chat/random-events.ts:177:27: warning eslint(no-magic-numbers): No magic number: 0
src/chat/random-events.ts:177:39: warning unicorn(no-null): Do not use `null` literals
src/chat/random-events.ts:181:14: warning eslint(id-length): Identifier name is too short (< 2).
src/chat/random-events.ts:184:27: warning eslint(no-magic-numbers): No magic number: 0
src/chat/random-events.ts:187:17: warning eslint(no-magic-numbers): No magic number: 0
src/chat/random-events.ts:196:10: warning eslint(sort-keys): Object keys should be sorted
src/chat/random-events.ts:210:1: warning eslint(func-style): Expected a function expression
src/chat/random-events.ts:220:1: warning eslint(func-style): Expected a function expression
```

The `lint - ts (eslint)` gate is the only pre-existing lint-ts failure remaining
after cleanup session 2026-08-24 (knip, dprint, db-schema, plan-sync all green).

## Impact

Cosmetic only. The `lint-ts` gate is red, blocking pre-commit and
`bun run check`. The warnings do not indicate actual bugs — `999` is
intentional default cooldown, short loop counters `e` / `roll` are idiomatic,
and `null` return is the documented control-flow signal.

## Acceptance Criteria

Pick ONE of:

- [ ] **Option A (preferred):** Per-file eslint disable comments for the
      specific warnings, e.g. `/* eslint-disable no-magic-numbers, id-length */`
      at the top of `generateRandomEvent` and `pickRandom` / `resolveTemplate`.
      Keeps the file idiomatic while clearing the gate.

- [ ] **Option B:** Resolve each warning by:
      - `999` → extract `MAX_COOLDOWN_DEFAULT` constant
      - `0` literals in comparisons → already idiomatic, replace with named
        constants `MIN_ROLL_THRESHOLD`, `MIN_WEIGHT_TOTAL`
      - `e` → rename to `event`
      - `null` → switch return type to `RandomEvent | undefined`
      - `sort-keys` → reorder keys in the return object
      - `func-style` → convert `function` declarations to `const = () =>` arrows

## Verification Notes

- **Last touched:** `05d39182 feat(chat): wire pruning, random events, context
  monitor` (pre-dates cleanup session 2026-08-24).
- **Fails in isolation:** confirmed via `bunx oxlint
  src/chat/random-events.ts` on `dev @ 793a170d`.
- **No behavior change** is acceptable; this is purely a lint-cosmetic fix.

**Discovered by:** cleanup session 2026-08-24, post-`793a170d` check run.
**Rationale for deferral:** Per subagent advisory "skip lint warnings
(pre-existing scripts issues)". File as ticket for future cleanup sprint.

## Chat Audit 2026-08-25 — Cross-Reference

**Finding B5:** Same skeletal `src/chat/random-events.ts` flagged by oxlint — confirms incomplete/stagnant implementation in the proactive/random-events subsystem.

_Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._
