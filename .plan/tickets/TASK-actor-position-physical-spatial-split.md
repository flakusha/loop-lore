<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor Position — Physical vs Spatial Split

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** actors, npc, position, transport, tree

**Summary:** Split actor position into physical_location_id (root of containment chain) and spatial_location_id (deepest leaf). npc_states.location_id becomes a denormalized cache of spatial_location_id. physicalPropagated batch-UPDATE keyed on path LIKE for transport movement.
**Context:** Without this split, an actor inside a ship's cabin would either always know where the ship is (no spatial precision) or never (no world/weather context). physical + spatial lets world systems read physical and narrative systems read spatial.
**Acceptance Criteria:** See acceptance checklist below.

## Summary

Split an actor's position into two IDs so containment chains work
correctly for fractal locations:
- `actor_locations.physical_location_id` — the **root** of the containment
  chain the actor is in (the transport itself, when on a ship).
- `actor_locations.spatial_location_id` — the **deepest leaf** (the cabin).

When the ship moves, `physical_location_id` changes on every actor inside;
`spatial_location_id` stays put. When the actor walks from cabin to deck,
only `spatial_location_id` changes.

The existing `npc_states.location_id` becomes a denormalized cache of
`spatial_location_id` (kept for backwards compatibility; new code reads
`actor_locations`).

## Acceptance Criteria

- [ ] `actor_locations` table populated for every actor in every world on
      first migration (backfill: `physical_location_id = spatial_location_id
      = current npc_states.location_id`).
- [ ] New service `src/rpg/actor-locations/service.ts` exports:
      `getPosition(actorId)` → `{ physical, spatial, enteredAt }`.
- [ ] `moveToLocation(actorId, spatialId)` validates the new location is in
      the same containment tree as the current `physical` (or transitions
      physical if the actor steps out of a transport).
- [ ] `physicalPropagated(actorId, newRootId)` — used by the travel
      scheduler when a transport docks/launches; updates `physical_location_id`
      for every actor whose `spatial_location_id` subtree rides the
      transport. Single batched UPDATE keyed on
      `path LIKE '/<transport>/%'`.
- [ ] Tests:
      - Backfill creates row per actor.
      - Walking deck → cabin only updates spatial.
      - Transport arrival updates physical but not spatial.
      - Stepping off transport updates both.

## Out of Scope

- The actual scheduler integration (covered by
  `TASK-travel-scheduler-tick.md`).

## Related

- `epic-fractal-locations.md`
- `TASK-locations-fractal-migration.md`
- `TASK-travel-scheduler-tick.md`
- `src/rpg/npc-navigation/service/movement.ts` (existing moveToLocation to
  be re-pointed at the new service).
