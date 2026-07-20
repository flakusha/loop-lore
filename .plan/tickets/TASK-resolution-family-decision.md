# TASK: Resolution Family Decision (blocking)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Low
**Related:** epic-resolution-system.md, epic-rpg-mechanics.md, epic-battle-action-systems.md

## Summary

A design decision is required before the RPG battle mode can be built: which TTRPG
resolution family loop-lore adopts. Research (rpg-landscape.md §6.3) shows the field
splits into narrative-light (PbtA, FATE) vs simulation-heavy (GURPS, D&D). The decision
blocks `epic-rpg-mechanics` combat/resolution work.

## Rationale

- Mixing families causes inconsistency and a dominant strategy (§6.7).
- Chat/RP mode wants low-bookkeeping narrative-light; battle switch may want crunch.
- PbtA/FATE are the recommended defaults for chat-RPG.

## Current State

- `src/rpg/dice.ts` exists (notation d4–d20, seeded rolls) but no _resolution family_
  (no 7–9 cost, no aspects, no skill rolls vs DC framing).
- No documented default.

## Decision needed

1. Default family for chat/RP mode: **PbtA** or **FATE**.
2. Whether battle mode uses a heavier family (GURPS/D&D) or the same.
3. Encode the choice as an extensible enum (see `epic-config-extensions.md` ECE).

## Acceptance

- [ ] Decision recorded in `docs/spec/rpg-mechanics.md`
- [ ] Resolver stub in `src/rpg` implementing the chosen family
- [ ] epic-resolution-system.md marked In Progress
