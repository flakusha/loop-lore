# TASK: Admin handlers lack explicit requireUserId (fail-open structural risk)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/admin/*.ts (~20 handlers: system-config, model-roles, model-capabilities, providers, chats, worlds, audit, stats, sd-status, review-stats, aux-telemetry, danger-zone, key-rotation, users) authorize via can(ctx.userRole,...) but none call requireUserId. Auth relies solely on userRole===null for anonymous 403; if global derive is detached or userRole gets non-null fallback, all admin endpoints open. Fix: add requireUserId(ctx) as first line in every admin handler or wrap admin groups in explicit authenticate guard. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
