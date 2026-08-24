# TASK: Telemetry endpoint trusts userId from request body

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/routes/telemetry.ts:39 sets userId: ctx.body.userId with no auth/ownership; endpoint gated only by frontend-telemetry flag, forgeable for any user. Fix: use authenticated ctx.userId, drop body userId. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
