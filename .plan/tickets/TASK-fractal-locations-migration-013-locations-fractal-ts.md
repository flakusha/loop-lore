<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fractal locations migration (013_locations_fractal.ts)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-fractal-locations
**Tags:** locations, schema, migration, transport, tree

**Summary:** Append-only Kysely migration extending locations with kind/mobility_mode/path/coord_*/current_route_id/travel_progress; creates travel_routes, travel_route_stops, actor_locations tables and five SQLite triggers (cycle, depth ≤ 12, cross-world reject, path-set on insert, path-rewrite on parent update). Full details in TASK-locations-fractal-migration.md.
**Context:** The current locations table has only parent_location_id (no depth guard, no cycle guard, no cross-world guard, no kind discriminator, no movement). This migration is the foundation of the fractal-locations epic.
**Acceptance Criteria:** See TASK-locations-fractal-migration.md.

## Summary

Append-only Kysely migration: add kind, mobility_mode, path, coord_*, current_route_id, travel_progress to locations; new tables travel_routes, travel_route_stops, actor_locations; 5 triggers (cycle/depth/cross-world/path-set/path-rewrite). See .plan/tickets/TASK-locations-fractal-migration.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
