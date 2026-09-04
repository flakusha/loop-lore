# BUG: BUG: rule-based assistant reply retries on any insert error and returns misleading 503

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/messages/reply.ts rule-based branch wraps the assistant message INSERT in a try/catch that retries on ANY error (not just the swipe-index unique conflict) up to 8 times, then returns a fixed 503 high concurrency error. Real failures (FK violation, encryption error, DB down) are masked and mislabeled as concurrency. Fix: catch only the unique-constraint conflict for retry; rethrow or return an accurate error for other failures.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated

## Resolution

Tightened `src/routes/messages/reply.ts` catch block: only the swipe-index unique-constraint race (scoped to `idx_messages_swipe_unique` columns `chat_id`, `parent_id`, `swipe_index`) is retryable. Any other error (FK violation, encryption error, DB down, schema mismatch, idempotency_key collision) is rethrown so Elysia surfaces the original cause as a 5xx instead of mislabeling it as 503 "high concurrency" after 8 silent retries. Added exported `isSwipeIndexUniqueViolation` predicate + unit test suite (`tests/routes/messages/reply-swipe-unique.test.ts`, 8 cases covering positive matches on all three columns + SQLITE_CONSTRAINT_UNIQUE form, negative matches on unrelated unique violations, FK violations, non-Error values, and plain errors). `bun run tsc --noEmit` clean; test suite 8/8 pass.
