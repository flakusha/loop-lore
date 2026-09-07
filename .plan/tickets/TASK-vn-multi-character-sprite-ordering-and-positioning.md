<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: multi-character sprite ordering and positioning

**Status:** ⬜ Not Started
**Priority:** medium
**Epic:** Avatar Alpha Channel + VN Layering; Visual Novel Mode
**Effort:** Medium

## Summary

Stage layout for 2+ sprites: ordered slots (far-left/left/center/right/far-right), depth/z-order layering, repositioning driven by message speaker and scene events, animated position transitions (transition-engine reuse). Supersedes single-portrait role-based logic in getPortraitPosition (src/frontend/vn/portrait-manager.ts). Works with sprite transform context anchor+scale (epic-asset-transform-metadata AV7). Acceptance: deterministic slot assignment per cast size, z-order rules (background < sprites < dialogue UI), no overlap collisions, transition unit tests.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
