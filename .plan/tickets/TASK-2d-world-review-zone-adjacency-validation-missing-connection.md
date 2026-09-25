<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: 2D world review: zone adjacency validation missing (connections unwired)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary
Settled decision 1 of epic-2d-sprite-world claims connections validate adjacency. Verified state: `locations.connections` is validated on write (`validateConnections`, fail-on-junk) and resolved for display in `location-explorer.ts`, but nothing *enforces* adjacency on movement: `getLocationConnections` (npc-navigation/pathfinding.ts) ignores `connections` entirely (returns up-to-5 same-world `location_states` rows, self-described placeholder). FEAT-2d-world-click-to-move (server validates zone adjacency) and seeded procgen both depend on adjacency validation against the stored graph. Wire movement + procgen gates to read the validated `connections` graph (or explicitly replace it with map_zones adjacency), and fix `getLocationConnections` to use the real graph. Without this, sprites can move between non-adjacent zones.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
