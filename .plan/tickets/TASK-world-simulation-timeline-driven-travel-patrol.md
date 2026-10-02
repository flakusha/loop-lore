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

**Resolved:** 2026-10-02 registry-driven close: git issue fbf4f84 (registry tip: 9e694754e Konstantin Fedotov Auto-closed: appended .md marker marks TASK-WORLD-SIMULATION-TIMELINE-D)

## Filing note

Re-pointed 2026-10-02 from `epic-actor-autonomy-story-drive` to
`epic-party-migration`. This ticket is greenfield — neither symbol it names
exists anywhere in `src/`: `advancePartyTravel` and `migrateNpc` return no
matches, and the only party concept in the codebase is chat-scoped membership
(`src/chat/service/party.ts`), while the only patrol concept is an
`NpcMovementState.patrolRoute` field. There is nothing here for the autonomy
loop to own: that epic's scheduler and tick driver are already shipped and
dispatch targets are registered per subsystem, so the travel/migration step is
a new dispatch target rather than autonomy-loop work.

`epic-party-migration` is the verified owner and wants exactly this: its Scope
lists "Party travel (lockstep step, coordinated arrival, time-aligned chats)",
"Party types: caravan, patrol, raid, trade convoy, hunting party, escort",
"Party -> world-tick integration (party moves consume game-time)" and "Per-party
schedule and route (patrol routes, trade routes)", and it already binds
`TASK-party-schedule-and-patrol-routes` and
`TASK-party-world-tick-and-chat-transfer-integration`. Its Design block even
defines the types this ticket assumes — `PartyState.currentTick` (the
`currentTick` ordering the first two acceptance criteria name),
`PartyRoute`, and a `cadence: "continuous" | "scheduled" | "patrol"` with a
`patrolRoute: LocationId[]`. `epic-world-npcs.md` is the co-owner of the
`migrateNpc` half ("NPC placement, migration, inventories") and
`epic-world-travel-time.md` of the game-time anchor; both are carried in
`**Related:**` since `**Epic:**` holds a single value.

The party schema this work builds on does not exist yet either — it lands with
`TASK-party-schema-crud-routes-and-migration` (bound to `epic-party-migration`),
so this ticket should stay behind that one. The 0.05-budget-unit accounting in
the third acceptance criterion is the one item that remains autonomy-side: the
`AutonomyGovernor` (`TASK-autonomy-rate-governor`, Done) meters actions per window,
not fractional cost, so a per-action cost weight is a governor extension rather
than part of the travel step.
