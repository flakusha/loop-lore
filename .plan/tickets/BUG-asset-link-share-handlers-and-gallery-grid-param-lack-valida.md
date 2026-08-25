# BUG: Asset link/share handlers and gallery grid param lack validation and access checks

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/assets/controller/handlers.ts: handleListLinks/handleListShares require only authentication — no access check on the asset, so any user can enumerate links/shares of any asset id. handleCreateLink accepts arbitrary entityType string (cast to AssetLinkEntity) and entityId with no ownership/existence validation; linkAsset swallows ALL errors including FK violations (returns 201 Created with nothing linked). handleDeleteLink defaults empty strings -> silent 204 no-op. Fix: resolveAsset before list links/shares; validate entityType against AssetLinkEntity enum via Elysia t.Union; scope catch to unique-constraint violations; reject empty delete params.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
