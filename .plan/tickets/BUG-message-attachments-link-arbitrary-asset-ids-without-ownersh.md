# BUG: Message attachments link arbitrary asset ids without ownership check

**Status:** fixed-in-worktree
**Priority:** high
**Effort:** Medium

## Summary

routes/messages/create.ts passes body.attachments straight to attachMessageAttachments (src/routes/messages/post.ts) which calls linkAsset directly, bypassing the ownership gate that POST /api/assets/:id/links enforces via requireAssetOwner. A user can link another user's private asset to their message and render it. Fix: validate each attachments[].assetId with requireAssetOwner (or canAccessAsset) before linking.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
