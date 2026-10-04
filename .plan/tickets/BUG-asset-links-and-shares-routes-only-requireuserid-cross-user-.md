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
