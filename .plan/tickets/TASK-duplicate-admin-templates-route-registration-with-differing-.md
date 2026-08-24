# TASK: Duplicate /admin/templates route registration with differing gates

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/routes/admin/templates.ts:17 and src/routes/admin-templates/{list,create,update,remove}.ts both register /admin/templates GET/POST/PUT/DELETE with different guards (requirePermission vs requireUserId+can). Overlapping paths risk Elysia duplicate-route error or silent shadowing where one gate is not applied. Fix: consolidate to single source of truth for /admin/templates. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
