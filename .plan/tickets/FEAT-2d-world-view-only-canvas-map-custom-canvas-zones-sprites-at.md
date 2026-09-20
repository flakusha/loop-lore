<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: view-only canvas map (custom canvas, zones + sprites at snapshot positions)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-2d-sprite-world
**Summary:** Read-only Alpine canvas component rendering zones and sprites; zero new deps.
**Context:** Epic epic-2d-sprite-world, first visual slice; reads world_maps + map_zones + actor_snapshots, no movement writes.
**Acceptance Criteria:** Map renders from seeded data; hundreds of sprites without jank; viewport+zone culling.

## Summary

Alpine canvas component, zero new deps: render world_maps background + map_zones rects (parallax by z_layer), sprites at actor_snapshots x/y. Read-only, no movement writes. Culling by viewport+zone. AC: map renders from seeded data, hundreds of sprites without jank.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
