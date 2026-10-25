<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Asset links and shares routes only requireUserId - cross-user enumeration

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — asset link and share routes are gated by `requireAssetOwner` (src/assets/controller.ts:119-130; applied at :380-381 GET links, :390 POST link, :406 DELETE link, :461 share delete, :477-478 GET shares) returning a 404 notOwnerResponse; missing-vs-foreign collapse pinned in src/assets/controller.acl.test.ts:148.
**Priority:** high
**Effort:** Medium
**Epic:** epic-auth-access

**Summary:**

GET /assets/:id/links (src/assets/controller.ts:350) and GET /assets/:id/shares (src/assets/controller.ts:443) only requireUserId - no per-asset ownership/canAccess check, so any authenticated user can enumerate link and share bindings of another user's asset by id. Fix: apply canAccessAsset (src/assets/service/read.ts:223-247) and return 404 for foreign assets, mirroring caption-route.ts:121.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): asset link and share routes are gated by `requireAssetOwner` (src/assets/controller.ts:119-130; applied at :380-381 GET links, :390 POST link, :406 DELETE link, :461 share delete, :477-478 GET shares) returning a 404 notOwnerResponse; missing-vs-foreign collapse pinned in src/assets/controller.acl.test.ts:148.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

Fix verified in worktree fix-asset-acl-guards (commit cf4f66f80 "fix(assets): gate asset routes on asset ownership": requireAssetOwner guard before GET links at src/assets/controller.ts:356-359 and GET shares at :453-456; missing and foreign unified into notOwnerResponse -> 404 via src/routes/http-utils/errors.ts:55-58, closing the existence oracle; dev HEAD :350-356/:443-449 still call only requireUserId); keep open until that branch finalizes/merges, then close. Note: the branch ships a strict owner check rather than the ticket's suggested canAccessAsset (src/assets/service/read.ts:223-247) - explicitly-shared non-owner viewers can no longer list links/shares either; enumeration bug is closed, capability nuance differs.

**Resolved:** 2026-10-25 registry-driven close: git issue fa48463 (registry tip: 0f7f5e4e3 Konstantin Fedotov Close issue)
