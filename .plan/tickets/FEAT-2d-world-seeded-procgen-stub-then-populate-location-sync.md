<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: seeded procgen + stub-then-populate location sync

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-2d-sprite-world
**Summary:** Seeded skeleton generation plus stub-then-populate location sync.
**Context:** Epic epic-2d-sprite-world; deterministic pass validated by existing gates (depth<=12, cross-world, adjacency); LLM pass for names/lore/NPCs.
**Acceptance Criteria:** Same seed reproduces skeleton; populate fills zones with sprites/items/NPCs/enemies.

## Summary

Seeded deterministic skeleton (region>settlement>building, kinds, routes, spawn tables) + LLM reconcile pass (names/lore/NPCs, validated: depth<=12, cross-world, adjacency). Stub locations (name+kind+zone rect) then sync fills 2D detail (sprites/items/NPCs/enemies). AC: same seed reproduces skeleton; populate fills zones.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
