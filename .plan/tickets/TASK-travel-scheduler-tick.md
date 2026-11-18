<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Travel Scheduler Tick

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** scheduler, transport, travel, events, cron

**Summary:** `TravelTickEngine.tick` (`src/locations/travel-engine.ts:55-142`) is wired as `locations.tick` in `src/cron/jobs.ts:246-258` (`*/2 * * * *`, `elapsedSeconds: 120`). It advances `travel_progress`, wraps looped routes, snaps coords at each stop, propagates rider positions and appends colon-style `transport:arrived` / `transport:departed` events to `world_event_log`.
**Context:** The built-in cron catalog drives world ticks; the travel job is a thin body over the engine, so no scheduler fork or `world_rules` toggle is needed. Route speed comes from `travel_routes.seconds_per_unit` (default 60).
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Shipped:

| Capability | Location |
| ---------- | -------- |
| `TravelTickEngine.tick(opts)` — pure `(db, opts)` result | `src/locations/travel-engine.ts:46-142` |
| Active-transport query (kind=transport, mode=free, route attached) | `travel-engine.ts:60-83` |
| Progress advance, loop wrap, non-loop pin + `arrived` count | `travel-engine.ts:89-116` |
| Stop crossing: coord snap + rider propagation + events | `travel-engine.ts:144-190` (coord snap :174) |
| `emitTransportEvent` → `world_event_log` with unique `dedupe_key` | `travel-engine.ts:192-214` |
| `locations.tick` cron job (`*/2 * * * *`, `elapsedSeconds: 120`) | `src/cron/jobs.ts:246-258` (name :248, schedule :249, elapsed :254) |
| Tests | `src/locations/travel-engine.test.ts` |

The cron path is `src/cron/jobs.ts` — there is no `src/scheduler/` directory, and the job is named `locations.tick`, not `travel.tick`. The cadence is a literal `*/2 * * * *` with a fixed 120-second elapsed value, not a `world_rules` setting. Route speed is `seconds_per_unit` on `travel_routes` (`001_init.ts:4082`), default 60.

**Stop-crossing side effects (landed this lane):** `applyStopArrival`
(`travel-engine.ts:144-190`) snaps `coord_x/y/z` to the destination stop's
coordinates (:174), calls `ActorPositionService.propagateTransportArrival`
(`src/locations/positions.ts:130`) for riders, then appends events via
`emitTransportEvent` (:192-214) into `world_event_log` (migration 041,
`dedupe_key` unique) with `subject_id` = transport id, JSON payload
`{routeId, stopId, progress, coords}`, tick index from `TickOptions.tickIndex`
(default 0), and conflict-do-nothing on
`${eventType}:${transportId}:${stopId}:${tickIndex}`. Event types use the
repo's colon convention — `transport:arrived` (:186) and `transport:departed`
(:188, loop wrap only) — never dot-style `transport.arrived`. Terminal
completion pins progress at the last stop and leaves `current_route_id`
attached; clearing it is not in this lane's scope.

## Acceptance Criteria

- [x] Tick engine at `src/locations/travel-engine.ts` (not
      `src/rpg/travel-scheduler/`), exports `TravelTickEngine.tick`.
- [x] Job registered as `locations.tick` in `src/cron/jobs.ts:246-258` with
      schedule `*/2 * * * *` and `elapsedSeconds: 120`.
- [x] Per-transport speed from `seconds_per_unit` (default 60) —
      `travel-engine.ts:91`, `001_init.ts:4082`.
- [x] Loop wrap and non-loop terminal pin — `travel-engine.ts:97-106`.
- [x] Stop crossing snaps coords and propagates riders — `travel-engine.ts:144-178`, `src/locations/positions.ts:130`.
- [x] Colon-style `transport:arrived` / `transport:departed` events appended
      to `world_event_log` with dedupe key — `travel-engine.ts:180-214`.
- [x] Tests in `src/locations/travel-engine.test.ts`.

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
- `src/cron/jobs.ts` (job catalog)
- `src/locations/travel-engine.ts` (tick engine)

## Verification Notes (2026-11-18)

- `src/locations/travel-engine.ts:55-142` tick; `:144-190` `applyStopArrival` (coord snap :174, rider propagation :177-178, `transport:arrived` :186, `transport:departed` :188); `:192-214` `emitTransportEvent` into `world_event_log` with dedupe key :210.
- `src/cron/jobs.ts:246-258` registers `locations.tick` (:248), `*/2 * * * *` (:249), `elapsedSeconds: 120` (:254).
- `grep current_route_id src/locations/travel-engine.ts` shows no nulling assignment — terminal completion keeps the route attached.
- Behavior covered by `src/locations/travel-engine.test.ts`.
