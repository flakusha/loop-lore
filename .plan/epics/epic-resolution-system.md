# EPIC: Resolution System & Ruleset Family

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Source:** .plan/research/rpg-landscape.md §6.3, §9, §10

## Summary

loop-lore's RPG layer needs a single, coherent resolution mechanic for "who wins / what
happens" when dice are rolled. Research (§6.3) shows TTRPG resolution families split into
**narrative-light** (PbtA, FATE) vs **simulation-heavy** (GURPS, D&D/Pathfinder). Adopt
**ONE** family as the default and, optionally, a heavier sim only on the battle mode
switch. Mixing families risks inconsistency and a dominant strategy.

## Decision required (blocking — see TASK-resolution-family-decision)

- **Default (chat / RP mode):** narrative-light — **PbtA** (2d6, 7–9 cost / 10+) or
  **FATE** (dF + rating vs opposition). Low bookkeeping; fits free-form chat-RPG.
- **Battle mode switch:** optionally **GURPS 3d6** or **D&D d20** for crunchy combat.
- **Rule:** do not mix families within a world.

## Options compared (from research §6.3)

| System                 | Mechanic                       | Weight       | Narrative centrality | Fit for loop-lore   |
| ---------------------- | ------------------------------ | ------------ | -------------------- | ------------------- |
| PbtA (Dungeon World)   | 2d6 move, 7–9 cost / 10+       | Light        | High                 | **Default chat/RP** |
| FATE Core              | dF + rating vs opposition      | Light-Med    | High                 | Default alt         |
| Savage Worlds          | skill die + wild die (explode) | Medium       | High                 | Hybrid              |
| GURPS 4E               | 3d6 roll-under skill           | Heavy        | Low (sim)            | Battle switch       |
| D&D 5e / Pathfinder 2E | d20 + mod vs DC                | Medium/Heavy | Medium               | Battle switch       |

## Tasks

- TASK-resolution-family-decision (blocking)
- Define default family + optional battle-switch family
- Implement resolver in `src/rpg` (extend `dice.ts`)
- Document in `docs/spec/rpg-mechanics.md`

## Related

`epic-rpg-mechanics.md`, `epic-battle-action-systems.md`, `epic-config-extensions.md`
(ECE can model resolution families as extensible enums)

## Linked Tasks

- TASK-resolution-system.md
