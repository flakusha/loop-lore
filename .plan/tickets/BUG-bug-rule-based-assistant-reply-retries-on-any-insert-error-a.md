# BUG: BUG: rule-based assistant reply retries on any insert error and returns misleading 503

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/messages/reply.ts rule-based branch wraps the assistant message INSERT in a try/catch that retries on ANY error (not just the swipe-index unique conflict) up to 8 times, then returns a fixed 503 high concurrency error. Real failures (FK violation, encryption error, DB down) are masked and mislabeled as concurrency. Fix: catch only the unique-constraint conflict for retry; rethrow or return an accurate error for other failures.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
