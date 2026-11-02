<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: consumeQuota accepts negative costs, raising remaining above the limit

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

src/assistant/quota/storage.ts (~line 92, memory backend): consumeQuota uses `active.used + cost > limitPerWindow`, so negative cost passes and `used` drops; observed consumeQuota("u", -5, T0) → returns 15 with limit 10. Repeated negative charges grant unlimited quota. Exposure is indirect (cost is engine-table-controlled in prod) but the API is exported. Expected: reject or clamp cost < 0. Evidence: skipped test documenting the bug at src/assistant/quota/storage.edge-cases.test.ts (test.skip "negative costs never raise remaining above the limit"), branch edge-case-tests-20261101, commit e0d071c5c (edge-case sweep 2026-11-01).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue e63c04c.

git issue: e63c04c
