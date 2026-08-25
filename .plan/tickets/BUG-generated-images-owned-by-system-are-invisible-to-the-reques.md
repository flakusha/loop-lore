# BUG: Generated images owned by 'system' are invisible to the requesting user

**Status:** 🔧 Fixed in worktree `fix-gallery-assets` (commits b6c232e5, 1b5de824)
**Priority:** high
**Effort:** Medium

## Summary

generation/image-gen-route.ts creates assets with ownerId 'system'; assets/service/create.ts defaults visibility to Private. canAccessAsset then denies the requesting user (not owner, not public, not shared) — generated images 404 outside embedded contexts that use signed URLs. Fix: set ownerId to the requesting user (thread userId into handleImageGeneration), or grant explicit share/visibility at creation.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
