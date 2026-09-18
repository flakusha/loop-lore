<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Generated images owned by 'system' are invisible to the requesting user

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** fixed-in-worktree
**Priority:** high
**Effort:** Medium

## Summary

generation/image-gen-route.ts creates assets with ownerId 'system'; assets/service/create.ts defaults visibility to Private. canAccessAsset then denies the requesting user (not owner, not public, not shared) — generated images 404 outside embedded contexts that use signed URLs. Fix: set ownerId to the requesting user (thread userId into handleImageGeneration), or grant explicit share/visibility at creation.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
