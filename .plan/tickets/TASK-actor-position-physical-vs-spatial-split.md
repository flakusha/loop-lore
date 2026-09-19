<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor position physical vs spatial split

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-fractal-locations
**Tags:** actors, npc, position, transport, tree

**Summary:** Split actor position into physical_location_id (root of containment chain) and spatial_location_id (deepest leaf); physicalPropagated batch-UPDATE keyed on path LIKE. Full details in TASK-actor-position-physical-spatial-split.md.
**Context:** Without this split, an actor inside a ship's cabin would either always know where the ship is (no spatial precision) or never (no world/weather context).
**Acceptance Criteria:** See TASK-actor-position-physical-spatial-split.md.

## Summary

actor_locations(physical_location_id, spatial_location_id). physical = root of containment chain (transport). spatial = leaf (cabin). npc_states.location_id becomes denormalized cache. Batch UPDATE keyed on path LIKE for transport propagation. See .plan/tickets/TASK-actor-position-physical-spatial-split.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
