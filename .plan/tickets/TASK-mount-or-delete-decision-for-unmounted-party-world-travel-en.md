<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Mount-or-delete decision for unmounted party world-travel engine

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

advancePartyTravel/migrateNpc (src/rpg/world-travel/travel.ts, migration.ts) have no HTTP route and no cron caller; state (route_index, travel_progress, current_location_id, status, blocked_until_tick) never reaches snapshot/SSE while the separate NPC processMovementTick drives the only live tick. Epic: epic-display-transitions (task 2). Research: .tmp/research/2d-canvas-3d-world/transitions.md section T2.2. Acceptance: either wired to cron+route with snapshot/SSE reachability, or deleted with callers verified absent; no dead engine that looks live. Related: TASK-travel-scheduler-tick (live tick), FEAT-2d-world-npc-simulation-tiers-t0-t3-ts-tick-event-driven-sna (tier context). Caveats: deletion is acceptable — verify zero imports/routes/cron refs first; if mounted, replay latch (current_tick claims set) must survive cron restarts without double-advance.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
