# BUG: listAssets treats Shared visibility as world-readable

**Status:** fixed-in-worktree
**Priority:** high
**Effort:** Medium

## Summary

visibilityFilter (src/assets/service/read.ts) ORs 'visibility = shared' without joining asset_shares, contradicting canAccessAsset which requires a share row. Executed probe: listAssets(bob) returns carol's asset shared only with alice; canAccessAsset(bob, same asset) = false. List shows assets the viewer cannot open. Fix: join asset_shares for the shared branch (shared_with_id in (actorId)) or drop shared from the list filter and rely on share rows.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
