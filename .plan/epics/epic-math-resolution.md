<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-MATH-RESOLUTION — Math models behind roll resolution

**Status:** 📝 Draft
**Priority:** medium
**Effort:** Large (multiple sub-tickets, see Sub-systems)
**Type:** Research → Implementation
**Tags:** rpg, math, dice, resolution, position, effect
**Overview:** Extend `src/rpg/interaction` to support multiple mathematical models of interaction resolution (d20, dice pool, 2d6, structured modifier rows) and add Position/Effect axes (à la Blades in the Dark). Keep the same ledger persistence and prompt surface; dispatch by `roll_kind`.

Extend `src/rpg/interaction` to support multiple mathematical models of
interaction resolution (d20, dice pool, 2d6, structured modifier rows)
and add Position/Effect axes (à la Blades in the Dark). Keep the same
ledger persistence and prompt surface; dispatch by `roll_kind`.

## Why

loop-lore's existing `interaction` service is a faithful 5e d20
implementation. That covers one canonical model. The research synthesis
(`docs/research/interaction-systems-math.md`) identifies two additional
high-value models — PbtA 2d6 (partial success) and dice-pool (Blades) —
and one cheap axis (Position/Effect) that materially improves the
narrative envelope without requiring a new resolver.

## Sub-systems

- `src/rpg/interaction/resolver.ts` — dispatch by `roll_kind`:
  `d20`, `dice_pool`, `2d6`.
- `src/rpg/interaction/roll/` — per-model math.
- `src/rpg/interaction/position-effect.ts` — Position/Effect axes and
  their prompt mapping.
- `src/db/migrations/009_math_resolution.sql` (auto-generated via Kysely)
  — `position`, `effect` enum columns on `interaction_logs`.

## Acceptance criteria

- A new `resolveInteraction` invocation can request
  `{ rollKind: "dice_pool", sides: 6, count: 3, modifier: 0,
     position: "risky", effect: "standard" }` and produces a
  Position/Effect-annotated outcome in `interaction_logs`.
- A new `resolveInteraction` invocation can request
  `{ rollKind: "2d6", stat: 1 }` and produces a `full` / `partial` /
  `miss` band.
- Existing 5e d20 tests still pass (no regression).
- The `interaction_context` prompt section includes `position` and
  `effect` lines when present.

## Out of scope

- Exploding dice (Savage Worlds) — research verdict: not recommended.
- Foundry AST — separate epic (`EPIC-RESEARCH-MATH-AST`).


git issue: 500eabc
