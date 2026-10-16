<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: user_api_keys non-unique index + read-then-write upsert allows dup rows

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

No UNIQUE(user_id,provider_name) — plain composite index (001_init.ts:362-366). Concurrent POSTs insert duplicate rows; executeTakeFirst reads arbitrary one. Fix: add unique constraint + onConflict upsert.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
