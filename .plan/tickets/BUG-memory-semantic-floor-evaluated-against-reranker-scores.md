<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: memory semantic floor evaluated against reranker scores

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-memory-knowledge-systems.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Hybrid retrieval replaces cosine scores with rerank scores, then the memory promotion gate compares those values against a cosine-scale floor. Reranker values are not comparable, so promotion decisions are wrong whenever reranking is enabled.

**Evidence (dev 2026-11-18):** embeddings.ts:220-227 overwrites cosine scores; memories.ts:126 places rerank scores in scoreMap; decide.ts:103 compares against semanticFloor 0.15; rerank.ts:14 documents that scores are never comparable to cosine.

**Scope:** carry cosineScore on semantic matches; gate promotion on cosine, order results on rerank; keep fail-open behavior and current config.

**Acceptance Criteria:**

- [x] rerank ordering is unchanged
- [x] low rerank numeric score does not reject a cosine-passing memory
- [x] cosine score below floor still rejects
- [x] no new config key

## Verification Notes (2026-11-18)

Commit `73209dc56`. `SemanticMatch.cosineScore` keeps the cosine value through rerank (`src/memory/embeddings.ts`), and `src/assistant/prompt/sections/memories.ts` feeds `cosineScoreMap` (not the rerank `scoreMap`) into the injection gate. Rerank order and tiny/negative rerank values are covered in `src/memory/embeddings.test.ts`; both gate directions are covered in `src/memory/injection/decide.test.ts`. Fail-open and config keys unchanged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
