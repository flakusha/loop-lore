<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: result-grade-persistence

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-testing-benchmarking
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Versioned rubric JSON loader + ResultGrade type + Kysely migrations (generation_requests/result_grades/artifact_versions/turn_feedback tables) behind flag; recompute-overall rule; zero behavior change. Owner epic: epic-testing-benchmarking. Anchors: src/aux-pipeline/runner.ts:92 (callAux graceful-degradation); src/aux-pipeline/types.ts (AuxTaskName union); src/eval/corpus.ts:189 (fixture pattern); tables do NOT exist yet (new surface). Refs: https://deepeval.com (rubric/judge-prompt shapes to copy); https://promptfoo.dev (assertion + CI gating patterns). Acceptance: migrations land behind flag; rubric loader works; recompute-overall rule; zero behavior change. Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
