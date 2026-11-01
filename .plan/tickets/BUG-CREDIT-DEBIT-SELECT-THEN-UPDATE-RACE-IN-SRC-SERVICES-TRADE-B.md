# BUG: credit/debit SELECT-then-UPDATE race in src/services/trade/balance.ts:102-158 loses concurrent updates; ensureBalanceRow re-read has no pre-image predicate so overlapping credit/debit pairs clobber. Add a conditional-write guard with a lost-race retry-or-fail contract plus a race test.

**Status:** Not Started
**Priority:** medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue 2cda5f0.

git issue: 2cda5f0
