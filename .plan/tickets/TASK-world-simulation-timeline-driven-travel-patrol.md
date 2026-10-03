<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: World Simulation Timeline Driven Travel Patrol

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive
**Tags:** world, simulation, tick

**Summary:**
World tick drives party travel (patrol routes) and NPC migration in a time-ordered simulation.

**Context:**
Existing world-tick scheduler covers actor autonomy; this ticket extends it to dispatch party travel and NPC migration events on each tick without per-tick LLM calls.

**Acceptance Criteria:**
- Hook into `epic-actor-autonomy-story-drive` scheduler so each tick fires `advancePartyTravel` for each party and `migrateNpc` for each migrating NPC.
- Time-ordered: events processed in `currentTick` order; conflicts (collision at location) resolved deterministically.
- Cost accounting: each action costs 0.05 budget unit; budget enforcement layered atop `epic-generation-flow-control`.
- Tests: 100-tick simulation deterministic given seed; budget exhausted -> no actions.

// hint: Structural and logic conflict. Both design and behavior differ.
**Resolved:** 2026-10-02 registry-driven close: git issue fbf4f84 (registry tip: 9e694754e Konstantin Fedotov Auto-closed: appended .md marker marks TASK-WORLD-SIMULATION-TIMELINE-D)
