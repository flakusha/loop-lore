<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Asset links and shares routes only requireUserId - cross-user enumeration

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

GET /assets/:id/links (src/assets/controller.ts:350) and GET /assets/:id/shares (src/assets/controller.ts:443) only requireUserId - no per-asset ownership/canAccess check, so any authenticated user can enumerate link and share bindings of another user's asset by id. Fix: apply canAccessAsset (src/assets/service/read.ts:223-247) and return 404 for foreign assets, mirroring caption-route.ts:121.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

Fix verified in worktree fix-asset-acl-guards (commit cf4f66f80 "fix(assets): gate asset routes on asset ownership": requireAssetOwner guard before GET links at src/assets/controller.ts:356-359 and GET shares at :453-456; missing and foreign unified into notOwnerResponse -> 404 via src/routes/http-utils/errors.ts:55-58, closing the existence oracle; dev HEAD :350-356/:443-449 still call only requireUserId); keep open until that branch finalizes/merges, then close. Note: the branch ships a strict owner check rather than the ticket's suggested canAccessAsset (src/assets/service/read.ts:223-247) - explicitly-shared non-owner viewers can no longer list links/shares either; enumeration bug is closed, capability nuance differs.
