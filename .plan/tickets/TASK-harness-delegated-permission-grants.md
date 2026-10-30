<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness delegated permission grants

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Delegated capability grant persisted on chat_branches (src/db/schema-core.ts:1393-1400) and consumed by requireWorldAccess (src/routes/worlds/access.ts:35-73). Boundary model: the main agent approves at spawn time (pi spawn-time capability grant; headless runs refuse when a grant would need an interactive prompt). Distinct from TASK-harness-subagent-delegation deny-list tool subsets.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
