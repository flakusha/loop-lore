<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: aux-grade-judge-tasks

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-aux-enrichment-pipeline
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

New aux tasks result-grade / claim-extract / prompt-adherence in AuxTaskName union with timeout/retry/graceful-null; golden fixtures + calibration harness; consensus wrapper reserved for low-confidence/safety. Owner epic: epic-aux-enrichment-pipeline. Anchors: src/aux-pipeline/runner.ts:92 (callAux); src/aux-pipeline/types.ts (AuxTaskName); src/generation/hooks/nsfw-classifier.ts; src/generation/hooks/moderation-classifier.ts. Refs: https://www.trulens.org (jury/ensemble consensus pattern); https://docs.ragas.io (faithfulness/answer-relevance metrics). Acceptance: three tasks in union with graceful-null; golden fixtures + kappa>=0.6 calibration; consensus reserved for low-confidence. DEFER: hosted LangSmith/Braintrust. Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
