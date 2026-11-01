<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Principal-aware worktree scope guard

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, scope-guard, security
**Depends on:** `TASK-rsi-scope-resolver-per-principal-kind`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Make assertParamsWithinScope accept a SERVER-ISSUED principal (amendment A1) and resolve root via the resolver instead of always git toplevel. Trust boundary: the principal is resolved server-side at the auth seam; tool params and chat context can never assert kind.
AC: a param-supplied principal is ignored; default (no principal) behavior unchanged (git toplevel) for back-compat; escape still denied per kind in tests.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] A param-supplied principal is ignored
- [ ] Default (no principal) behavior unchanged (git toplevel) for back-compat
- [ ] Escape still denied per kind in tests
