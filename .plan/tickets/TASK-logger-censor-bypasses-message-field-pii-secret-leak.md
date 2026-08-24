# TASK: Logger censor bypasses message field (PII/secret leak)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/logger/logger.ts:97-110 censors only meta; message (string or structured object) bypasses censor entirely. logger.info({password:x}) or logger.info('token='+t) leak raw to DB plus JSONL. Fix: run censorMeta on message too, or forbid structured messages and force meta. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
