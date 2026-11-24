<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Connection hardening for honkbox dispatch

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-server-lifecycle-hardening
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: re-probe cadence, auto-started llama.cpp circuit-breaker registration (existing BUG ticket), 403 mapping shared with bearer-scope ticket. Note: breaker slice B in-flight in tree honkbox-coverage-2026-11-24; coordinate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
