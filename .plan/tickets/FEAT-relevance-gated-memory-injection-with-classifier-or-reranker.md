<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Relevance-gated memory injection with classifier or reranker grading

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:**

Memory selection for context injection is relevance-blind: probabilistic decide.ts roll plus importance-sorted 1024-token budget (src/memory/budget.ts). Add a relevance grade between semantic rerank (memory/rerank.ts, already computed but rank-only and env-gated) and selectWithinBudget: threshold existing rerank scores or add an AUX memory-grade task with generative fallback, failing open to current ordering. Touch graded-include memories so access tracking stays truthful. Research note: MemReranker (arXiv 2605.06132) shows miscalibrated relevance scores break threshold filtering, so calibrate before gating. Rides the classifier-model-support cluster.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-03 registry-driven close: git issue ef636a2 (registry tip: fbf9b0e15 Konstantin Fedotov Close issue)
