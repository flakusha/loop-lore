<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RAG known-answer eval harness (30+ Qs, chunks/questions JSONL)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-rag-evaluation-observability
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

RAG-slice enabler #4 from .tmp/research/external-brains/05-rag.md. The question set outlives every later decision. 30+ hand-written known-answer Qs over own memories + chunks.jsonl/questions.jsonl harness (Big Iron pattern). Hybrid RRF exists (TASK-hybrid-search-rrf-fusion-plus-rerank); caption-to-memory has fact-capture; grade-gate has grade-gated ticket. This harness measures them: hit@1/hit@3/MRR before vs after; reranker adoption rule (hybrid+MiniLM-L6-top-10 beats hybrid hit@3 by >=3/30 at <=1s/query CPU, else leave out — Big Iron measured +1/30 tie). Frameworks: Ragas metrics, DeepEval. Default cross-encoder family bge-reranker-v2-m3 class — never adopt on reputation (bge-base measured WORSE than hybrid at 12s/query CPU). Explicit non-recs: no Qdrant/pgvector, no CLIP until caption retrieval proves lossy, no inline LLM-rerank.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
