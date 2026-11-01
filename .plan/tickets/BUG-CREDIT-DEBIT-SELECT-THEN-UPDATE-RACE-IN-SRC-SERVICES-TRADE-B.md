<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# BUG: credit/debit SELECT-then-UPDATE race in src/services/trade/balance.ts:102-158 loses concurrent updates; ensureBalanceRow re-read has no pre-image predicate so overlapping credit/debit pairs clobber. Add a conditional-write guard with a lost-race retry-or-fail contract plus a race test.

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)
**Effort:** (none captured)

**Status:** Not Started
**Priority:** medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue 2cda5f0.

git issue: 2cda5f0
