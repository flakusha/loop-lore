<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Travel Scheduler Tick

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** scheduler, transport, travel, events, cron

**Summary:** Scheduler-driven tick advances travel_progress on every free-mode transport; on crossing a stop, snaps coord_*, fires transport.arrived/departed events; handles loop vs terminal completion.
**Context:** Existing scheduler pattern (src/scheduler/) drives world ticks. Adding a travel.tick job integrates ship/transport movement without forking the scheduler; per-transport speed defaults to 60s/unit on the route.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Scheduler-driven tick that advances `travel_progress` on every transport
location with `mobility_mode='free'` and a non-null `current_route_id`.
When `travel_progress` crosses a `travel_route_stops` boundary:
- snap `coord_*` to the stop's coordinates,
- clear or update `current_route_id` based on whether the route continues,
- fire `transport.arrived` / `transport.departed` events through the existing
  event bus.

Wired into the existing `src/scheduler/` cron pattern (see
`docs/spec/scheduler.md`). Tick rate: configurable via `world_rules` (default
= once per real-time minute when the scheduler is on `real_time` mode).

## Acceptance Criteria

- [ ] New file `src/rpg/travel-scheduler/tick.ts` exports `advanceTravel(state, now)`.
- [ ] New file `src/rpg/travel-scheduler/index.ts` registers a `travel.tick`
      scheduled job with the existing scheduler.
- [ ] On crossing a stop: emit `transport.arrived(locationId, routeId,
      stopId)` and (if continuing) `transport.departed(locationId, routeId,
      stopId)` events.
- [ ] On looped route completion: reset `travel_progress=0` and re-snap to
      first stop coordinates.
- [ ] On non-looped route completion: clear `current_route_id` and
      `travel_progress`, leave transport at last stop coordinates.
- [ ] Per-transport speed is encoded as `seconds_per_unit` on the route
      (default: 60).
- [ ] Tests in `src/rpg/travel-scheduler/tick.test.ts`:
      - Advance to next stop fires `arrived` event.
      - Crossing loop wraps progress.
      - Paused world (scheduler off) does not advance.
      - `free`-mode transport with NULL `current_route_id` is a no-op.

## Out of Scope

- LLM narrative for arrivals (chat background sync) — separate ticket under
  the chat background epic.
- Random encounter rolls during travel — separate ticket (already a stub
  in `epic-exploration-discovery.md`).

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-travel-routes-schema-and-crud.md`
- `docs/spec/scheduler.md`
