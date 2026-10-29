<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: hybrid search RRF fusion plus rerank

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-rag-evaluation-observability
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-rag-evaluation-observability.md (vector-store/RAG retrieval side). RRF fusion over FTS5 plus embedText, rerankViaLlamaCpp reuse, parent-child chunks, rag_query_cache, synonym map. Defer sqlite-vec and ColBERT per synthesis verdict. Caveats: fusion weight drift, rerank latency budget, cache invalidation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
