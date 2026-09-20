<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: spatial layer migration (world_maps, map_zones, spawn_points, actor_snapshots + space LocationKinds)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-2d-sprite-world
**Summary:** Forward migration adding world_maps, map_zones, spawn_points, actor_snapshots tables and space LocationKinds.
**Context:** Epic epic-2d-sprite-world, spatial-layer slice; grounding in migration 013_locations_fractal (coord_x/y/z, actor_locations, path tree).
**Acceptance Criteria:** Migration roundtrip green; db:sync-types + manifest regenerated; schemas:check green.

## Summary

New forward migration: world_maps(world_id, style_pack, width, height, background), map_zones(map_id, location_id, x, y, w, h, z_layer, parallax_factor), spawn_points(zone_id, kind, x, y), actor_snapshots(actor_id, x, y, heading, updated_at, trigger). Extend LocationKind with space kinds (sector, celestial, station, anomaly). Regen db:sync-types + manifest. AC: migration roundtrip green, schemas:check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
