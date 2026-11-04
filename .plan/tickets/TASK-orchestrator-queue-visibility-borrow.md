<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Orchestrator queue visibility borrow

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Agetor/openorchestrator/agent-orchestrator converge on queue + retries + dashboard over one-agent-one-worktree; giwt owns lanes/ledger but lacks queue visibility. Scope: minimal queue/visibility borrow only; signed finalize + gates stay ours. Lowest priority. Research: harness-git-integration section 3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
