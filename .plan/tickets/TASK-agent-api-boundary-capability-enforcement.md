<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Agent API boundary capability enforcement

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, agent-api, authorization
**Depends on:** `TASK-principal-aware-worktree-scope-guard`, `TASK-capability-grant-model-on-chat-branches`, `TASK-escalation-audit-queue-with-no-auto-approve`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

RSI Part B routes (/api/v1/agent/*) enforce principal + capability grants before acting. External agents confined to assigned worktree; internal-service may finalize via worktree + finalize (amended default, provisional — owner may override). Audit every decision into tool_call_audit. Task-graph amendment A5 applied: NO dependency on the internal-service bootstrap (the boundary lands DEFAULT-DENY before any principal exists — no credentials means no access); dependency on the escalation-audit mechanism added so audit rows have somewhere to go.
AC: every boundary call is mediated (complete mediation) and audited; uncredentialed access is denied.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Every boundary call is mediated (complete mediation) and audited
- [ ] Uncredentialed access is denied (default-deny before any principal exists)
