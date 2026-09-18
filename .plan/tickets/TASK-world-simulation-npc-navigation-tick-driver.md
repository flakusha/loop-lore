<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: World Simulation NPC Navigation Tick Driver

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive
**Tags:** world, simulation, navigation

**Summary:**
Tick driver for NPC navigation: the existing `NpcNavigationService` ticks need an autonomous caller.

**Context:**
`TASK-wire-npc-navigation-routes` notes "no caller drives ticks autonomously". This ticket ships the tick driver on top of `epic-actor-autonomy-story-drive` scheduler.

**Acceptance Criteria:**
- New `src/rpg/npc-navigation/tick-driver.ts`: calls `processMovementTick(currentTick, db)` once per scheduler tick.
- Jittered (configurable) so NPCs do not move in lockstep.
- Governor denies on budget exhaustion (reuses `epic-actor-autonomy-story-drive` governor).
- Tests: tick driver fires at scheduled cadence; paused on world pause; budget respected.
