<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness multi-agent turn queue

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Assistant-class participant turns plus detached-job parallelism: sequential turn assignment, parallel computation (CrewAI-style). Distinct from the shipped character turn selection in src/group-chat/turn-selector.ts. DEFERRED until subagent-branch runs (Option C) exist; no multi-assistant code exists today.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
