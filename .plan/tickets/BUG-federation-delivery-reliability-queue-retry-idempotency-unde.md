# BUG: Federation delivery reliability (queue, retry, idempotency) undefined

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-activitypub-federation does not specify delivery queueing, retries, idempotency for duplicate Create, or dead-letter handling. Robustness gap. Fix: add a delivery pipeline AC with retry and idempotency keys.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
