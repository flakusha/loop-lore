# TASK: Log files created world-readable (0644)

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

src/logger/transports/file.ts:38,52 writes JSONL with default umask so files 0644 and dirs 0755, persisting PII (emails, userId, sessionId) and any censor-missed secrets. Fix: pass mode 0o600 to appendFile and 0o700 to mkdir. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed in bugfix-round-7: `src/logger/transports/file.ts` `writeLocked` now passes `mode: 0o700` to `mkdir` and `mode: 0o600` to `appendFile`, so JSONL logs (emails, userIds, sessionIds, censor-missed secrets) are no longer world-readable. Regression test `src/logger/transports/file.test.ts` asserts file 0600 / dir 0700.
