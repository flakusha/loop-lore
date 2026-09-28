<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: World Simulation NPC Navigation Tick Driver

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive
**Tags:** world, simulation, navigation

**Summary:**
Tick driver for NPC navigation: the existing `NpcNavigationService` ticks need an autonomous caller.

**Context:**
`TASK-wire-npc-navigation-routes` notes "no caller drives ticks autonomously". This ticket ships the tick driver on top of `epic-actor-autonomy-story-drive` scheduler.

**Acceptance Criteria:**
- [x] New `src/rpg/npc-navigation/tick-driver.ts`: calls `processMovementTick(currentTick, db)` once per scheduler tick.
- [x] Jittered (configurable) so NPCs do not move in lockstep.
- [x] Governor denies on budget exhaustion (reuses `epic-actor-autonomy-story-drive` governor).
- [x] Tests: tick driver fires at scheduled cadence; paused on world pause; budget respected.

## Implementation Notes

`src/rpg/npc-navigation/tick-driver.ts` exposes
`runNpcMovementTick(db, worldId, opts)` — one call == one scheduled tick.

- Delegates to the existing `processMovementTick(currentTick, db)` from
  `src/rpg/npc-navigation/service/processing.ts`; no new movement logic.
- Short-circuits before dispatch on four conditions, each a distinct
  `skipped` discriminant: `paused`, `disabled` (autonomy off in the resolved
  config), `jitter`, `budget`. The discriminant makes the no-op auditable
  instead of an empty result set.
- Jitter: `jitterRatio` from the resolved config drives a per-tick Bernoulli
  drop so NPCs do not move in lockstep (ponytail: tick-level sampling —
  per-NPC jitter would mean changing `processMovementTick`, owned by another
  ticket). Deterministic given an injected `rng` and `nowMs`.
- Budget: one `AutonomyGovernor.tryConsume` per tick on the `per_tick_action`
  limit, scoped `user` / `world:<worldId>` — the driver has no actor or user
  identity of its own, so a synthetic world-scoped id is used, and the cap it
  charges is `perUserCap` (the cap for that scope). A denial returns
  `{ skipped: "budget" }` and does not touch movement; the scheduler still
  advances the cursor, so the world is rescheduled rather than dropped or
  re-selected on every pass.
- Pure function: no cron, no `setInterval`. Both `AutonomyScheduler` and the
  manual `POST /api/rpg/npc-navigation/worlds/:worldId/tick` route call it,
  so neither path bypasses the governor.
