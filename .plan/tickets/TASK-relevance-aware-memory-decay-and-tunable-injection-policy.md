<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: relevance aware memory decay and tunable injection policy

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Memory purge currently uses elapsed time only, and injection ignores the relevance scoring that already exists in the hybrid search code. Relevance should inform decay and be tunable alongside certainty and importance.

**Evidence (dev 2026-11-18):** report 02 G2-G4; purge is time-only; the RRF hybrid scorer in the search layer is not used for injection; no combined relevance/certainty/importance config exists.

**Scope:** after the rerank score fix lands, feed a stable relevance grade into decay; expose weights for relevance, certainty and importance; decide whether to reuse the existing RRF scorer for injection candidates.

**Acceptance Criteria:**

- [ ] low-relevance memories decay differently from high-relevance ones
- [ ] weights are configurable with safe defaults
- [ ] existing purge behavior is covered by regression tests

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
