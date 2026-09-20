<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: boarding + floors via fractal tree (transports, parallax)

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-2d-sprite-world
**Summary:** Boarding as position-pair switch; floors/parallax as fractal children with z_layer.
**Context:** Epic epic-2d-sprite-world; ActorPositionService pair switch; fleet = transport with ship-transport children.
**Acceptance Criteria:** Board/unboard preserves spatial; floors render layered.

## Summary

Board = ActorPositionService pair switch (physical into transport subtree, spatial follows route). Floors/parallax = child locations, z_layer + parallax_factor on map_zones. Fleet = transport with ship-transport children. AC: board/unboard preserves spatial; floors render layered.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
