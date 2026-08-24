# TASK: Register username race and rate-limiter multi-instance gap

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/auth/register.ts:74-90 checks existing username then inserts; concurrent same-username registrations both pass, second fails unique constraint to uncaught 500 or dup. Fix: INSERT ON CONFLICT (username) DO NOTHING + re-read. Also src/middleware/rate-limit.ts buckets are per-process in-memory, not shared across Bun workers/instances, so login/register limits are bypassed under multi-instance deploy; use shared store or document single-instance assumption. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
