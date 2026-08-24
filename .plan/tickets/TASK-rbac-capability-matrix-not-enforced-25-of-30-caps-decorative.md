# TASK: RBAC capability matrix not enforced (25 of 30 caps decorative)

**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Medium

## Summary

src/users/permissions.ts defines 30 capabilities but only admin.* appear in can()/requirePermission calls; chat.create, character.create, world.*, user.*, export.*, import.*, moderation.* never enforced. RBAC collapses to role-name/owner checks. Fix: add requirePermission guards in matching routes or prune dead caps. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
