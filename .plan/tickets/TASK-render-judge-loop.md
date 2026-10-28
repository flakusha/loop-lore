<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Render judge loop

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-3d-generation
**Tags:** 3d, feedback-loop
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Tiered judge (deterministic QA, then preference score with same-prompt-only constraint, then VLM critique returning structured verdicts) plus adjustment policy: verdicts stored on the run; assistant confirm gate offers apply-adjustments-and-rerun; loop bounded (max iterations config) under the flow-control machinery. AC: a low-score render triggers at most the configured iterations then parks with verdicts visible; cross-prompt preference comparison is rejected; judge failures mark unchecked, never fail the run.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
