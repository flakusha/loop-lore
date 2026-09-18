<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Duplicate /admin/templates route registration with differing gates

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done — landed on `authz-bug-cluster` (commit `a714a4376`)
**Priority:** low
**Effort:** Medium

## Summary

src/routes/admin/templates.ts:17 and src/routes/admin-templates/{list,create,update,remove}.ts both register /admin/templates GET/POST/PUT/DELETE with different guards (requirePermission vs requireUserId+can). Overlapping paths risk Elysia duplicate-route error or silent shadowing where one gate is not applied. Fix: consolidate to single source of truth for /admin/templates. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
