# TASK: Log files created world-readable (0644)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/logger/transports/file.ts:38,52 writes JSONL with default umask so files 0644 and dirs 0755, persisting PII (emails, userId, sessionId) and any censor-missed secrets. Fix: pass mode 0o600 to appendFile and 0o700 to mkdir. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
