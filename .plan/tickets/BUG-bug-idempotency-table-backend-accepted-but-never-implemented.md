# BUG: BUG: idempotency table backend accepted but never implemented (silent memory fallback)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/idempotency.ts IdempotencyConfig accepts backend: table and an asyncStore, but the implementation only ever uses the in-memory Map (memory.get/put/markInFlight); asyncStore and backend === table are never consulted. Selecting table silently behaves like memory, losing restart/error resilience and cross-instance sharing that the doc comment promises. Fix: implement the table backend (read/write request_results via the async store) or remove the table option and its documentation.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
