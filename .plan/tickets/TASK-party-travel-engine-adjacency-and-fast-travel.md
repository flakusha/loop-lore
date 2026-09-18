<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party Travel Engine Adjacency And Fast Travel

**Status:** ⬜ Not Started
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
