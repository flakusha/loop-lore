<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: test unified search admin scope and partial failure

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-api-routes.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Unified cross-surface search has four tests, all as an ordinary user. Admin visibility across chats and behavior when one backend fails remain unverified.

**Evidence (dev 2026-11-18):** report 13 G3; all four existing tests use userRole user; admin and partial-failure paths have no coverage.

**Scope:** add admin visibility tests for a chat the admin did not participate in, admin plus chatId, and blank query; add a partial-failure case, introducing a test-only seam only if needed.

**Acceptance Criteria:**

- [ ] admin scope behaves as documented
- [ ] partial failure returns a partial result with error detail
- [ ] tests do not depend on global state

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
