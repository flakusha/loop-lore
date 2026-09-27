<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: locations tree.ts header names nonexistent triggers

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Summary:** Fix tree.ts header naming nonexistent triggers.
**Context:** 001_init creates 4 triggers; depth/cycle enforced app-layer.
**Acceptance Criteria:** Header describes the real enforcement split.

## Summary

src/locations/tree.ts header comments cite trg_locations_no_cycle and trg_locations_depth_limit triggers, but 001_init.ts only creates 4 location triggers (trg_locations_no_self_parent, trg_locations_cross_world_parent, trg_locations_set_path_on_insert/update). Cycle rejection and depth-12 enforcement are app-layer in LocationTreeService. Fix the header comments to describe the real enforcement split. Discovered in 2D canvas epic review.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
