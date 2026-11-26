<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor Position — Physical vs Spatial Split

**Status:** In Progress
**Status Note:** 2026-11-18 reconciliation against shipped code. Table, backfill, service, HTTP routes and batched propagation are shipped; this lane adds `propagateTransportArrival` + `transport:arrived` / `transport:departed` events. The physical/spatial semantics are **inverted** relative to this ticket and the epic (see Caveats), and `moveToLocation`, the `npc_states` write-through cache and the backfill test are carried work — not claimed done.
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Related:** TASK-actor-position-physical-vs-spatial-split (duplicate pair); TASK-validate-npc-movetolocation-and-actor-position-sets-same-wor; TASK-travel-scheduler-tick
**Tags:** actors, npc, position, transport, tree

**Summary:** `actor_locations` + backfill shipped in `src/db/migrations/001_init.ts:4100-4119, 4191-4195`; `ActorPositionService` lives at `src/locations/positions.ts:31-180` (not `src/rpg/actor-locations/service.ts`); GET/POST actor position at `src/routes/worlds/fractal-locations-routes.ts:49-100`. Caveat: code uses physical=container / spatial=geo-stop, the inverse of the epic's physical=root / spatial=leaf.
**Context:** Without a split, an actor in a ship's cabin either always knows where the ship is or never does. The shipped split gives world systems the container transport and narrative systems the geographic stop — but the two IDs are assigned oppositely to the original design, and `npc_states.location_id` is only backfilled once, not kept as a live cache.
**Acceptance Criteria:** See acceptance checklist below.

## Summary (shipped evidence)

| Deliverable | Shipped at |
| ----------- | ---------- |
| `actor_locations(actor_id PK, physical_location_id, spatial_location_id, entered_at)` + two indexes | `src/db/migrations/001_init.ts:4100-4119` |
| First-migration backfill from `npc_states.location_id` (both IDs = legacy location) | `src/db/migrations/001_init.ts:4191-4195` |
| Position service (`setPosition`, `getPosition`, `clearPosition`, `deriveForTransport`, `propagateTransportArrival`) | `src/locations/positions.ts:42-82`, `:89-111`, `:118-120`, `:151-179`, `:130-140` |
| Public barrel export | `src/locations/index.ts:8-9` |
| `POST` / `GET /api/actors/:actorId/position` | `src/routes/worlds/fractal-locations-routes.ts:49-81`, `:82-100`; mounted `src/routes/worlds/index.ts:37` |
| Batched rider update on arrival + event emission | `src/locations/positions.ts:130-140`, called `src/locations/travel-engine.ts:177-178`; events `:186-189`, insert `:193-212` |
| Service tests | `src/locations/positions.test.ts:47-131`, `src/locations/travel-engine.test.ts:210-271` |
| Cross-world / same-location invariant assertions | `src/db/locations-fractal-invariants.test.ts:185-203` |

## Caveats — physical/spatial semantic inversion (explicit)

This ticket (Summary and bullets at original lines 19-27) and `epic-fractal-locations.md:31-33` define:

- `physical_location_id` = **root** of the containment chain (the transport itself when aboard).
- `spatial_location_id` = **deepest leaf** (the cabin).
- therefore "when the ship moves, `physical_location_id` changes on every actor inside; `spatial_location_id` stays put".

Shipped code inverts both names:

- `physical_location_id` = the actor's **immediate container** (the transport while aboard), `src/locations/positions.ts:7-10, 13-14`.
- `spatial_location_id` = the **fixed geographic stop** (where the ship is — a region/settlement/building), `src/locations/positions.ts:10-11, 122-125`.
- on arrival the batched UPDATE keeps `physical = transport` and snaps every rider's `spatial` to the stop, `src/locations/positions.ts:130-140`, invoked from `src/locations/travel-engine.ts:177-178` — the exact opposite of the ticket's arrival rule.

The shipped code is the working contract; do **not** silently swap the columns to match the epic. Re-aligning the model needs an explicit epic decision because it flips every caller (service, tick engine, UI badge, events).

Related event caveat: the epic's Cross-System Events table now documents colon-style `transport:arrived` / `transport:departed` plus `location:travel` / `location:discovered` (`epic-fractal-locations.md:130-136`), matching the shipped tick (`src/locations/travel-engine.ts:186, 188, 193-212`) and repo convention (`location:travel` at `src/locations/edge-discovery.ts:131`, `location:discovered` at `src/db/migrations/041_world_discovery_trade_events.ts:36`). The old dotted names were pre-reconciliation plan text, not a current contract mismatch. `transport.position_changed` is absent from both epic and code — carried work.

## Acceptance Criteria

- [x] `actor_locations` table populated on first migration (backfill `physical = spatial = npc_states.location_id`) — `src/db/migrations/001_init.ts:4100-4107`, `:4191-4195`.
- [x] Position service exists — corrected path `src/locations/positions.ts:31-180`; the ticket's `src/rpg/actor-locations/service.ts` was never created. `getPosition` returns `ActorPosition` (`actorId`, `physicalLocationId`, `spatialLocationId`, `enteredAt`, `worldId`) at `:23-29, 89-111`, not the ticket's `{ physical, spatial, enteredAt }` shape.
- [ ] `moveToLocation(actorId, spatialId)` with same-containment-tree validation — no such method; tracked by `TASK-validate-npc-movetolocation-and-actor-position-sets-same-wor`. Carried.
- [x] Batched propagation — shipped as `propagateTransportArrival(transportLocationId, spatialLocationId)` at `src/locations/positions.ts:130-140`, keyed on `physical_location_id = transport` rather than `path LIKE '/<transport>/%'`, with **inverted semantics** (Caveats). Coverage: `src/locations/positions.test.ts:114-131`.
- [ ] Test: backfill creates one row per actor — absent; the backfill SQL exists but has no assertion. Carried.
- [ ] Tests: "walking deck → cabin only updates spatial" and "stepping off transport updates both" — absent and moot under shipped semantics (spatial is the geo stop, not the cabin). Carried pending the epic decision.
- [x] Tests: transport arrival moves riders' spatial in one UPDATE, non-riders untouched — `src/locations/positions.test.ts:114-131`; tick-level arrival/rider/event assertions `src/locations/travel-engine.test.ts:210-271`.

## Carried (not claimed done)

- `moveToLocation` and re-pointing `src/rpg/npc-navigation/service/movement.ts` — `src/locations/positions.ts:17-18` explicitly leaves this for a later step.
- `npc_states.location_id` as a maintained denormalized cache: backfill is one-way (`001_init.ts:4191-4195`) and `setPosition` writes only `actor_locations` (`positions.ts:66-82`).
- Backfill / deck↔cabin / step-off tests; `physicalPropagated` under the original name and `path LIKE` keying.
- `transport.position_changed` / `transport:position_changed` — absent from both epic (`epic-fractal-locations.md:130-136`) and code (see Caveats).

## Out of Scope

- The actual scheduler integration (covered by `TASK-travel-scheduler-tick.md`).

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-travel-scheduler-tick.md`
- `src/rpg/npc-navigation/service/movement.ts` (existing moveToLocation to be re-pointed at the new service — carried)
