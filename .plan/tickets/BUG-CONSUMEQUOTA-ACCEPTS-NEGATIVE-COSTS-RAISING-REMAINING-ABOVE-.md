# BUG: consumeQuota accepts negative costs, raising remaining above the limit

**Status:** Not Started
**Priority:** medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue e63c04c.

git issue: e63c04c
