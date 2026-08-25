# BUG: Caption route has no ownership check and overwrites foreign alt_text

**Status:** 🔧 Fixed in worktree `fix-gallery-assets` (commits b6c232e5, 1b5de824)
**Priority:** high
**Effort:** Medium

## Summary

POST /api/generation/caption -> handleImageCaption (src/generation/caption-route.ts) fetches any assetId with bare getAsset and writes alt_text to it; userId param only feeds BYO-key resolution. Any authenticated user can caption and OVERWRITE alt_text of another user's asset. Also: unvalidated body cast, silent catches without logging. Fix: require ownership (requireAssetOwner or canAccessAsset + owner-only write-back); log provider failures.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
