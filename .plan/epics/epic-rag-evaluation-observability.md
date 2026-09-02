<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG Evaluation & Observability

**Status:** ⬜ Not Started
**Priority:** High (blocks shipping `epic-rag-assets-unified-storage-and-assistant-flows.md` B-R4 + B-R5 with confidence)
**Effort:** Medium
**Type:** Feature Epic (cross-cutting)
**Tags:** rag, evaluation, observability, telemetry, golden-datasets, regression, prompt-cache
**Parents:** `epic-rag-document-processing.md` (RAG hub), `epic-analytics-observability.md` (analytics dashboard)
**Bridges:** `epic-rag-retrieval.md`, `epic-rag-vector-store.md`, `epic-rag-assets-unified-storage-and-assistant-flows.md` (B-R4 hybrid ranking + B-R5 replay log)

## Summary

Stand up the **measurement surface** that makes every RAG change shippable with confidence: golden datasets (query → expected-doc/expected-chunk fixtures) with recall@k / NDCG@k / MRR metrics, a regression harness wired into `bun run check`, retrieval + injection telemetry (which chunks fired, citation click-through, latency, cost-per-query), and a prompt-result semantic cache for repeated queries. Without this surface, B-R4's "cross-encoder rerank improves top-1 NDCG@10" and B-R5's "replay log audit" claims in `epic-rag-assets-unified-storage-and-assistant-flows.md` cannot be evidenced.

## Why this epic exists (the gap)

- `epic-rag-retrieval.md` mentions "cross-encoder reranking (optional, slow)" but provides no evaluation rig to know whether the reranker is helping or hurting.
- `epic-rag-assets-unified-storage-and-assistant-flows.md` B-R4 acceptance criteria cite NDCG@10 regression tests but do not own the fixture/harness.
- `epic-analytics-observability.md` covers per-chat cost dashboards but does not own **per-retrieval** telemetry (which docs were injected, what was the latency, did the user click any citation).
- No existing epic owns **prompt-cache** (semantic cache for repeated queries); current cost-per-query on repeated chats is high.
- No existing epic owns **golden datasets** — the static fixtures needed to make "did this change break retrieval?" answerable.

## Core Principles

| Principle | Implementation |
|---|---|
| **Evidence-driven shipping** | Every RAG-related ticket must reference ≥1 golden-dataset fixture or live-telemetry counter; "should work" claims blocked. |
| **Cheap to run, cheap to extend** | Default eval suite runs in <60s on a developer laptop and <5min in CI; adding a new query fixture is one row + one expected-doc. |
| **Deterministic + reproducible** | Eval fixtures pinned to a content hash (BLAKE3 over the expected-chunk bytes); rerunning eval = byte-identical scores. |
| **Telemetry is opt-in by row, not by default** | Per-query spans written via existing `src/telemetry/`; per-document ingestion spans only when `RAG_TELEMETRY=verbose`. |

## Design

### 1. Golden Datasets (`src/rag/eval/golden/`)

```ts
// src/rag/eval/golden/types.ts
export interface GoldenQuery {
  id: string;                       // ULID
  query: string;
  expectedDocIds: string[];         // any-of for recall@k
  expectedChunkIds?: string[];      // optional — for NDCG@k
  relevanceGrades?: Record<string, 0 | 1 | 2 | 3>;  // chunk_id -> grade (for NDCG)
  tags: string[];                   // ["image", "character", "worldbook", ...]
  notes?: string;
}
```

Fixture files committed at `src/rag/eval/golden/*.json` — small (target ≤50 queries per suite), versioned with the code, regenerated when docs change (CI failure forces update). Suites:

| Suite | Size | Coverage |
|---|---|---|
| `golden-image.json` | 20 | Image caption + OCR retrieval |
| `golden-text.json` | 30 | File/PDF ingestion chunks |
| `golden-message.json` | 15 | Chat message decomposition + cross-refs |
| `golden-character.json` | 10 | Character-card field lookup |
| `golden-worldbook.json` | 10 | Worldbook entry keyword trigger + content |
| `golden-hybrid.json` | 15 | Multi-kind queries (forces vector + FTS5 + tag fusion) |

### 2. Metrics (`src/rag/eval/metrics.ts`)

Standard IR metrics, no external dep:

```ts
export function recallAtK(actual: string[], expected: string[], k: number): number;       // 0..1
export function mrr(actual: string[], expected: string[]): number;                        // 0..1
export function ndcgAtK(actual: string[], grades: Record<string, number>, k: number): number; // 0..1
export function citationClickThrough(citations: Citation[], clicks: string[]): number;    // 0..1
```

### 3. Eval Harness (`src/rag/eval/runner.ts`)

```ts
// src/rag/eval/runner.ts
export interface EvalReport {
  suite: string;
  queryCount: number;
  metrics: {
    recallAt5: number;
    recallAt10: number;
    mrr: number;
    ndcgAt10: number;
  };
  perQuery: Array<{
    query: GoldenQuery;
    retrieved: SearchResult[];
    metrics: { recallAt5: number; recallAt10: number; mrr: number; ndcgAt10: number };
    latencyMs: number;
    promptCacheHit: boolean;
  }>;
  contentHash: string;        // pins input set
  gitHead: string;           // pins code
  timestamp: string;
}
```

Run via `bun run rag:eval` (writes `.tmp/rag-eval-report.json`); compare against last-known-good baseline; fail CI if NDCG@10 drops >2% absolute.

### 4. Retrieval Telemetry (`src/rag/telemetry/`)

```ts
// src/rag/telemetry/retrieval-span.ts
export interface RetrievalSpan {
  id: string;                       // ULID
  query: string;
  queryHash: string;                // BLAKE3 (dedup + cache key)
  timestamp: string;
  durationMs: number;
  retrievalMethod: "vector" | "fts" | "hybrid" | "graph";
  fusionWeights?: { alpha: number; beta: number; gamma: number; delta: number; eps: number };
  retrievedDocIds: string[];
  retrievedChunkIds: string[];
  injectedDocIds: string[];         // subset that actually made it into the prompt
  citationChips: number;            // count of citation chips in response
  promptCacheHit: boolean;
  rerankUsed: boolean;
  rerankLatencyMs?: number;
  totalTokens: number;              // prompt + completion
  modelRole: ModelRole;
  modelId: string;
  userId?: string;
}
```

Persisted to a new `rag_retrieval_spans` table (additive migration). Spans roll up into:

- `rag_retrieval_spans_daily` (precomputed counters; nightly job)
- `rag_query_patterns` (deduped by `query_hash`; tracks top 1000 queries by 7-day rolling volume)

### 5. Prompt-Result Semantic Cache (`src/rag/cache/semantic-cache.ts`)

```ts
// src/rag/cache/semantic-cache.ts
export interface SemanticCacheEntry {
  queryEmbedding: Float32Array;     // from ModelRole.Embeddings
  queryText: string;
  responseText: string;             // assistant answer (after RAG)
  citations: DocReference[];
  createdAt: string;
  hitCount: number;
  lastHitAt: string;
  ttlSeconds: number;               // default 86400 (1 day)
}
```

Key: nearest-neighbor search over embeddings within τ=0.05 cosine; only exact-similarity matches serve cache (no semantic-rewrite — too risky for assistant output). Cache table: `rag_prompt_cache` with HNSW index (reuses existing vector store infra per `epic-rag-vector-store.md`). TTL eviction by nightly job.

### 6. Citation Click-Through (`src/rag/telemetry/citation-clicks.ts`)

Frontend emits a `POST /api/rag/citation-click` per citation chip click with `{spanId, docId, position}`; recorded against the `rag_retrieval_spans` row. Powers the B-R4 "citation streaming surfaces source chips in chat response" acceptance criterion with measurable signal.

### 7. Admin Dashboard Surface (extending `epic-analytics-observability.md`)

Adds a `/admin/rag` panel (reuses admin model-picker surface from `epic-rag-assets-unified-storage-and-assistant-flows.md` B-R3):

- **Eval status** — last eval run per suite; NDCG@10 trend (sparkline)
- **Top queries** — last 7d, deduped by `query_hash`
- **Cache hit rate** — `prompt_cache_hit / total_queries` over time
- **Cost per query** — `total_tokens * model.price` rolled up per ModelRole
- **Dead documents** — docs with zero citations over 30d (candidates for archival)
- **Citation click-through** — per-document click rate (surfaces docs that get retrieved but never clicked → low-quality)

## Batches (each ships standalone; gates per batch)

### B-E1 — Golden Datasets + Metrics + Harness

- `GoldenQuery` type + 6 fixture files (`src/rag/eval/golden/*.json`)
- Metrics: `recallAtK`, `mrr`, `ndcgAtK` (no external dep)
- Eval runner `src/rag/eval/runner.ts` → `bun run rag:eval`
- Baseline comparison + CI failure on >2% NDCG@10 regression
- Report in `.tmp/rag-eval-report.json`

### B-E2 — Retrieval Telemetry

- `rag_retrieval_spans` migration (additive)
- `RetrievalSpan` type + structured-logger integration
- Per-call instrumentation in `src/rag/hybrid.ts` (created by `epic-rag-assets-unified-storage-and-assistant-flows.md` B-R4)
- `rag_retrieval_spans_daily` rollup + `rag_query_patterns` view
- Opt-in via `RAG_TELEMETRY=verbose`

### B-E3 — Prompt-Result Semantic Cache

- `rag_prompt_cache` migration (with HNSW index)
- `SemanticCacheEntry` type + nearest-neighbor lookup
- Cache `get`/`put` integration in `src/rag/hybrid.ts`
- TTL eviction nightly job
- Cache-hit telemetry field on `RetrievalSpan`

### B-E4 — Citation Click-Through

- `POST /api/rag/citation-click` route
- Frontend citation chip instrumentation (chat-bubble HTML extension)
- Click attribution to `rag_retrieval_spans` row

### B-E5 — Admin Dashboard

- `/admin/rag` route + view (htmx partial)
- Eval status, top queries, cache hit rate, cost per query, dead-doc candidates, citation CTR
- Extends `epic-analytics-observability.md` dashboard surface

## Files (new)

```
src/rag/
├── eval/
│   ├── runner.ts                   # NEW
│   ├── metrics.ts                  # NEW
│   ├── types.ts                    # NEW (GoldenQuery, EvalReport)
│   ├── baseline.ts                 # NEW (load last-known-good)
│   └── golden/
│       ├── golden-image.json       # NEW
│       ├── golden-text.json        # NEW
│       ├── golden-message.json     # NEW
│       ├── golden-character.json   # NEW
│       ├── golden-worldbook.json   # NEW
│       └── golden-hybrid.json      # NEW
├── telemetry/
│   ├── retrieval-span.ts           # NEW (RetrievalSpan type)
│   ├── citation-clicks.ts          # NEW
│   └── rollup.ts                   # NEW (nightly job)
├── cache/
│   └── semantic-cache.ts           # NEW
src/db/
├── migrations/<ts>_rag_telemetry.ts   # NEW (rag_retrieval_spans + rag_prompt_cache)
└── repositories/rag-telemetry.ts     # NEW
src/routes/
├── rag-eval.ts                     # NEW (POST /api/rag/eval, GET /api/rag/eval/report)
├── rag-citation-click.ts           # NEW (POST /api/rag/citation-click)
└── rag-cache.ts                    # NEW (admin: GET/DELETE /api/rag/cache)
src/frontend/admin/
└── rag.html                        # NEW (extends epic-frontend-admin)
scripts/
└── run-rag-eval.ts                 # NEW (bun run rag:eval)
docs/spec/
├── rag-eval.md                     # NEW
└── rag-prompt-cache.md             # NEW
```

## Acceptance Criteria

### B-E1 (Eval harness)

- [ ] All 6 fixture files committed with ≥100 total queries
- [ ] `bun run rag:eval` runs all suites in <60s on a dev laptop, <5min in CI
- [ ] NDCG@10 reported per-suite with baseline comparison
- [ ] CI fails if any suite's NDCG@10 drops >2% absolute vs baseline
- [ ] Adding a new query fixture is a single JSON row (no code changes)

### B-E2 (Telemetry)

- [ ] `rag_retrieval_spans` rows written for every hybrid retrieval call (when `RAG_TELEMETRY=verbose`)
- [ ] `rag_query_patterns` view returns top 1000 deduped queries by 7d volume
- [ ] Nightly rollup populates `rag_retrieval_spans_daily` with cost + cache-hit counters

### B-E3 (Cache)

- [ ] `rag_prompt_cache` lookup returns cached response for exact-similarity match (cosine ≤0.05)
- [ ] Cache hit recorded as `prompt_cache_hit=true` on `RetrievalSpan`
- [ ] TTL eviction removes entries past `ttlSeconds`
- [ ] Cache hit rate >40% on a synthetic 100-query replay test (target only; `[INFERENCE]`)

### B-E4 (Citation clicks)

- [ ] `POST /api/rag/citation-click` records against `rag_retrieval_spans`
- [ ] Frontend citation chip emits click event with `{spanId, docId, position}`
- [ ] Per-document click-through rate computable via SQL aggregation

### B-E5 (Dashboard)

- [ ] `/admin/rag` renders eval status, top queries, cache hit rate, cost per query, dead-doc candidates, citation CTR
- [ ] Each panel ≤200ms TTI on 100k-span history `[INFERENCE]`

## Dependencies

- **Hard:** `epic-rag-retrieval.md` (retrieval surface to instrument), `epic-rag-vector-store.md` (vector infra for cache HNSW index), `epic-rag-assets-unified-storage-and-assistant-flows.md` B-R4 (hybrid retrieval to instrument), `epic-telemetry.md` (structured logger).
- **Soft:** `epic-rag-enterprise.md` (audit trail reuses `RetrievalSpan` for `rag_queries` join), `epic-analytics-observability.md` (dashboard host), `epic-frontend-admin.md` (admin nav extension).
- **No new deps.** Metrics are pure TypeScript; HNSW index reuses existing vector store.

## Non-Goals

- Online learning / bandit feedback loops (out of scope; telemetry surfaces the signal, future epic consumes it)
- Cross-encoder training (ranking model is pluggable; not owned)
- A/B testing framework (covered by `epic-analytics-observability.md` `model_comparisons` table)
- Eval dashboard with custom query authoring (read-only; admin can re-run, can't author suites from UI)

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Golden datasets drift** (fixtures no longer reflect reality) | Fixture `contentHash` pins expected output; CI forces fixture refresh + new baseline when reality shifts |
| **Cache poisoning** (stale response served after doc update) | TTL default 1d; admin can flush via `DELETE /api/rag/cache`; cache key includes `documents_updated_at` |
| **Telemetry cost** (1M spans/day = real money) | Opt-in via `RAG_TELEMETRY=verbose`; production default = sampled 10%; raw spans compressed + archived after 30d |
| **Eval suite bias** (suites don't match real queries) | Telemetry B-E2 surfaces `rag_query_patterns`; new suites added when top-query patterns uncovered |
| **Cache similarity threshold too tight** (low hit rate) or **too loose** (irrelevant hits) | Default τ=0.05; A/B-testable via admin panel; B-E3 acceptance target >40% hit rate `[INFERENCE]` |

## Open Questions

1. **Eval suite owner:** human or agent? Suggest human (golden datasets are domain-sensitive; agent can't judge "is this the right character for this query"). Agent helps author fixtures + run harness.
2. **Cache similarity threshold:** ship τ=0.05 default, or admin-pickable per-deployment?
3. **Telemetry sampling rate:** 10% default in prod, or 100% for the first 30 days post-launch then downsample?
4. **Eval report retention:** keep last 90 days of `.tmp/rag-eval-report.json` files, or only the most recent + the baseline?
5. **Citation click-through as quality signal:** count only positive clicks, or weight by time-on-page (engagement)?

## Tickets (deferred)

- `TASK-rag-eval-harness.md` — B-E1
- `TASK-rag-retrieval-telemetry.md` — B-E2
- `TASK-rag-prompt-cache.md` — B-E3
- `TASK-rag-citation-clicks.md` — B-E4
- `TASK-rag-admin-dashboard.md` — B-E5

## Related

- `epic-rag-document-processing.md` — RAG hub
- `epic-rag-retrieval.md` — retrieval surface (instrumented by B-E2)
- `epic-rag-vector-store.md` — vector infra (HNSW reused for cache)
- `epic-rag-assets-unified-storage-and-assistant-flows.md` — provides B-R4 hybrid + B-R5 replay log; B-R4 acceptance cites NDCG@10 (this epic owns the rig)
- `epic-rag-enterprise.md` — audit trail joins `RetrievalSpan`
- `epic-analytics-observability.md` — dashboard host (extended)
- `epic-telemetry.md` — structured logger reused
- `epic-frontend-admin.md` — admin nav extended
- `epic-benchmark-ci-regression.md` — sibling benchmark CI discipline (eval reuses the same harness pattern)
