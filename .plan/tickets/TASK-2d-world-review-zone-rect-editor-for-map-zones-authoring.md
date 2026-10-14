<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: 2D world review: zone-rect editor for map_zones authoring

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Summary:** Zone-rect editor for map_zones authoring in world-management UI.
**Context:** epic-2d-sprite-world; epic-world-management-ui covers CRUD, not rects.
**Acceptance Criteria:** Rects editable; reuses view-only canvas component.

## Summary

Epic epic-2d-sprite-world assumes map_zones rects exist but no UI authors them. epic-world-management-ui covers location CRUD, not zone rects (x,y,w,h,z_layer,parallax). Add zone-rect editing to world-management UI (canvas-backed editor reusing the view-only canvas component from FEAT-2d-world-view-only-canvas-map). Blocks seeded population UX; unblocks procgen stub-then-populate review.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
