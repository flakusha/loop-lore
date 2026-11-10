<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Party Travel Engine Adjacency And Fast Travel

**Status:** In Progress
**Status Note:** 2026-11-10 (release-010-closeout): the engine shipped with a different shape than the ticket describes — `advancePartyTravel` lives in `src/rpg/world-travel/travel.ts` (not `src/parties/travel.ts`) and is called as `advancePartyTravel(db, worldId, tick, ctx)` from the autonomy scheduler (`src/autonomy/dispatch/travel-dispatch.ts`): it walks a party's route one edge per tick, updates `current_location_id` and `status`, enforces a per-window budget ceiling and resolves arrival collisions (first claimant wins, the loser defers a tick). Tests: `src/rpg/world-travel/travel.test.ts`. Still open: a `party:arrived` event broadcast and the chat transfer on arrival (tracked by `TASK-party-world-tick-and-chat-transfer-integration`).
**Priority:** high
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, travel, location-graph

**Summary:**
Travel engine that consumes the location graph and advances a party along adjacency edges or fast-travel edges, realigning to game-time.

**Context:**
A party must move coherently across the world: adjacency step (one edge at a time), fast-travel (instant location change with cooldowns). The engine binds parties to `epic-world-travel-time` (edge durations) and to the world-tick scheduler.

**Acceptance Criteria:**
- `src/parties/travel.ts` exports `advancePartyTravel(partyId, currentTick, db)`: looks at the route, advances one edge per tick (configurable), updates `currentLocationId`, broadcasts `party:arrived` event.
- Edge durations pulled from `epic-world-travel-time`; fast-travel edges use shorter durations and `requiresDiscovery` flag.
- Arrival triggers chat transfer (consumes `TASK-party-world-tick-and-chat-transfer-integration`).
- Tests: party follows route; out-of-route fallback; pause/resume.
