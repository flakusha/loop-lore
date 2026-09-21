<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Condition-driven NPC behavior (frightened flee, poisoned sluggishness)

**Summary:** NPC behavior/state machines do not read character Conditions. NPC decision points should factor active conditions: frightened NPCs flee or surrender more readily, poisoned/slowed NPCs act later or less effectively, disoriented NPCs mis-target. Visual rendering of conditions in combat/2D views is covered by the sprite-pipeline status-overlay ticket; this ticket owns behavior only.
**Context:** Complements FEAT-2d-world-npc-simulation-tiers (behavior substrate) and the implemented combat conditions (src/rpg/combat/conditions.ts); conditions become a shared input to both combat resolution and out-of-combat NPC choice.
**Acceptance Criteria:** NPC decision function consumes active conditions via the shared Condition contract; at minimum frightened → flee/surrender bias and poisoned → initiative/accuracy penalty outside combat; effects deterministic and testable; behavior shifts surface in prompt narration; tests per condition-behavior mapping.

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Substrate: .plan/tickets/FEAT-2d-world-npc-simulation-tiers-t0-t3-ts-tick-event-driven-sna.md, src/rpg/combat/conditions.ts
- Visual counterpart: FEAT-2d-world-pixel-art-sprite-pipeline (status overlays)
- Depends on: TASK-shared-character-domain-models

**Branch:** open on dev.
