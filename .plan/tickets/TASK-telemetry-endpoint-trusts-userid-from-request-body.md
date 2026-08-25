# TASK: Telemetry endpoint trusts userId from request body

**Status:** ✅ Resolved 2026-08-25 — route already uses server-derived ctx.userId (verified on dev); no body trust remains
**Priority:** high
**Effort:** Medium

## Summary

src/routes/telemetry.ts:39 sets userId: ctx.body.userId with no auth/ownership; endpoint gated only by frontend-telemetry flag, forgeable for any user. Fix: use authenticated ctx.userId, drop body userId. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
