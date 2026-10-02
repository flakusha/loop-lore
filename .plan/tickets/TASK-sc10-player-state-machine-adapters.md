<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gate adapters for player-state-machine Phase 0 / Phase 3 contract

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** The immersion gate uses actor state (skills, inventory, items, battle checks) as ground truth. `epic-player-state-machine.md` Phase 3 will provide a unified layered state module. Until Phase 3 lands, the gate ships with adapters over the existing state sources: `src/rpg/skills`, `src/story/items`, and battle resolution checks. This ticket scopes the Phase 0 adapter layer (what ships now) and the Phase 3 adapter transition plan (what changes when the unified module lands).

**Context:** `matrix-story-coherence.md` SC10. `epic-immersion-consistency-gate.md` lists its state sources: `src/rpg/skills`, `src/story/items`, battle checks. `epic-player-state-machine.md` owns the layered state model. P6 waves are deferred. SC3 gate/skip interlock shipped independently. SC10 is the state-consumption seam — scoped for Phase 0 viability and Phase 3 swappability.

**Acceptance Criteria:**

- [ ] Gate adapters defined: an `ActorStateAdapter` interface with methods `hasSkill(skillId)`, `hasItem(itemId)`, `isCaptive()`, `hasFailedCheck(checkId)`.
- [ ] Phase 0 adapters implemented over existing `src/rpg/skills`, `src/story/items`, battle checks — identical behavior to current inline checks, just behind the interface.
- [ ] Gate rule engine reads state exclusively through `ActorStateAdapter` — no direct imports of skill/item/battle internals in gate logic.
- [ ] Phase 3 adapter stub documented: when `epic-player-state-machine.md` Phase 3 ships, the adapter is swapped to the unified module with no gate logic change.
- [ ] Adapter interface covered by unit tests; existing gate behavior regressions covered.
- [ ] `bun run check` green.

**Epic:** epic-player-state-machine
**Tags:** gate, adapters, player-state, skills, inventory, battle, integration, deferred
**Related:** epic-immersion-consistency-gate.md, epic-player-state-machine.md, matrix-story-coherence.md:36, epic-two-pass-delivery.md, src/rpg/skills, src/story/items, src/battle/resolution-integration/checks.ts

**Git Issue:** 8b088d4
