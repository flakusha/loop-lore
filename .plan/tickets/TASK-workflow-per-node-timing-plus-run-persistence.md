<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: workflow per-node timing plus run persistence

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-workflow-engine
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-workflow-engine.md. Micro-slices: per-node timing in NodeStates, persist WorkflowRun beyond process memory, per-node backoff timers. Defer saga, hierarchical SM, viz. Caveats: timer drift on restart, persisted-state schema migration.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
