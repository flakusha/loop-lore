<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: eval rubric-judge-tiered-runner

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-rag-evaluation-observability
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-rag-evaluation-observability.md (+ CI wiring via epic-benchmark-ci-regression.md). Slices: RPG rubric JSONs, src/eval/judge.ts pointwise+pairwise cached, tiered runner, cost tracker, annotation/HITL queue, experiment framework. Highest-leverage new work; unblocks quality gates for every other lane. Caveats: judge bias calibration, cost guardrails, idempotent reruns.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
