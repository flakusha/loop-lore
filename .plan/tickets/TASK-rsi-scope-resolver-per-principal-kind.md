<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RSI scope resolver per principal kind

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, scope-guard
**Depends on:** `TASK-principal-kind-model-and-server-side-resolution`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add resolveScopeRoot(principal) returning the correct root per kind, consuming PrincipalKind from epic-principal-scoped-credentials. User/user-worktree = PASS-THROUGH: root resolved from the explicit root param (current behavior) until project spaces land (amendment A3 — the unsourced `<userId>`/`<project>` path claims are dropped, evaluation A14); internal-service to repo worktree root; external-agent to its assigned worktree.
AC: no behavior change yet — pure resolver plus unit tests per kind.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] No behavior change yet — pure resolver plus unit tests per kind
- [ ] User/user-worktree = pass-through (explicit root param); internal-service = repo worktree root; external-agent = its assigned worktree
