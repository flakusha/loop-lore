<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Search/RAG Coverage Bridge — Algorithm Research + Implementation Notes

Worktree: `search-rag-research`. Companion to `TASK-search-rag-coverage-bridge.md`
(planning-only) and the 14 tickets filed in `518373e1`. All claims below were
verified against the tree on 2026-09-07 (Bun 1.4.2) unless marked `[ASSUMED]`.

## 1. Verified baseline (what exists today)

Three disjoint stacks, no shared abstraction (`src/search/`, `src/rag/` do not
exist; zero search-related deps in `package.json`):

| Stack | Location | Technique |
|---|---|---|
| Message search | `src/routes/message-search/`, `parts/016_fts.ts` | FTS5 (`porter unicode61`), `snippet()` + `bm25()` ordering, hand-built `MATCH` query with operator-injection neutralization |
| Memory recall | `src/memory/embeddings.ts`, `parts/012_memory.ts` | Ollama `nomic-embed-text`, float32 BLOBs, exact linear-scan cosine in JS (`rankBySimilarity`, minScore 0.5; `semanticRecall` 0.3) |
| Name/substring | `src/routes/chat-search/`, `gallery.ts` | SQL `ILIKE %q%` / client-side substring, no ranking |
| Injection gate | `src/memory/injection/relevance.ts` | Keyword-set overlap (≥2 shared or ≥20%) |

Hard limits found: client-pre-encrypted rows store `content_plaintext = NULL` and
are **unsearchable** (ciphertext-leak guard blanks snippets — correct, but recall
is zero). Gzip'd rows keep a plaintext mirror, so they stay searchable.

## 2. Runtime capability probes (Bun 1.4.2, this tree)

- `bun:sqlite` `Database.loadExtension` — **present** (`typeof === "function"`).
  sqlite-vec is therefore loadable in principle, but needs a per-arch `.so`
  build step; third-party reports of Bun's bundled SQLite refusing dynamic loads
  in some configurations → **spike required before committing to sqlite-vec**.
- `bun:ffi` `dlopen` — **present**. Rust-cdylib path (`rg`/`grep` crate) is viable;
  budget the CI matrix (linux-x64/arm64, macos-x64/arm64) + TS fallback.
- `Bun.stringDistance` — **absent** (`undefined`). The unified-service ticket's
  "Levenshtein via Bun's string distance" is wrong; fuzzy needs pure-TS
  (none vendored — no fuse/minisearch in deps) or the Rust backend.
- FTS5 `trigram` tokenizer ships with SQLite — zero-dependency fuzzy substrate.

## 3. Algorithm recommendations per surface

| Surface | Recommended | Why | Evidence status |
|---|---|---|---|
| Message search (plaintext) | Keep FTS5 BM25; add trigram aux table for typo tolerance | Already tuned; trigram is free | Implemented; trigram unmeasured |
| Encrypted recall | HMAC-token scheme per unified ticket (word tokens ≥3 chars, per-user key in new `users` column) | Only scheme that keeps server blind; frequency-leak accepted on record | Design only — **flag**: token frequency leaks topic shape; consider ≥4 chars + bigram variant later |
| Memory semantic | Keep Ollama + linear scan to ~10k vectors; sqlite-vec only after spike | Linear scan is exact and simple; ANN buys nothing at small N | **Flag**: `memory_embeddings` default dims 1536 vs nomic-embed-text 768 — verify no silent truncation/padding bug |
| Gallery/character/world names | FTS5 trigram first; ripgrep-FFI only if trigram p95 misses budget | trigram needs no binary, no CI matrix; rg wins on multi-field regex, not on name lookup | Benchmark must test trigram-vs-rg on real asset names — ticket assumes rg without evidence |
| RAG hybrid | RRF fusion of FTS5 + cosine (already the plan); cross-encoder rerank deferred | RRF is 20 lines, no model; rerank needs ONNX/API | Agree with ticket order |
| Internet cache lookup | FTS5 over cached snippets + query-hash exact hits | Cache hits are exact-hash; fuzzy only for "similar question" | New code either way |
| SPLADE / ColBERT / Tantivy / Meili / Jina / external HNSW | **Defer all** | Each adds a service, model, or API dependency against the self-host/offline constraint (see local-search-cache ticket) | Explicitly out until benchmark proves FTS5+cosine insufficient |

## 4. Dynamic selector vs fixed modes

The rust-ffi ticket proposes a runtime selector over intents × surfaces ×
deployment flags, fed by `results.json` from `bun run search:benchmark`.
Recommendation: **land fixed per-scope dispatch first** (unified-service ticket
as written), add the selector as a second step **only if** two backends ever
coexist for one scope. Today no scope has two backends, so the selector would
be dead machinery. Exception: keep the `SearchIntent` type now — it is cheap
and makes the later upgrade mechanical.

## 5. Robots / retry / rate-limit (robots-quota ticket)

Design is sound and standard (24h robots cache, full-jitter backoff honouring
`Retry-After`, per-provider sliding window + per-user second order,
gzip'd public/private cache split with ACL). Two interactions to record:

- `BUG-429-responses-omit-retry-after-and-x-ratelimit-headers.md` — our own API
  omits `Retry-After` today; fix it in the same pass or our retry code cannot be
  dogfooded.
- Crawl-delay enforcement needs a per-host last-fetch timestamp — reuse the
  `search_rate_limit_state` table rather than a second store.

## 6. Proposed execution order (refines bridge ticket §Order)

1. Unified service with **fixed** dispatch + HMAC tokens + atomic migration
   (`users` secret column + `message_search_tokens` + triggers).
2. Encrypted backfill (same migration, idempotent chunks) — encrypted recall
   goes from 0 to partial on day one.
3. Injection guard (defines `CapabilityTag`; blocks prompt-injected tool calls
   before more tools exist).
4. Gallery backend search on trigram FTS5 (no Rust dependency).
5. Capability disclosure + admin allowlist UI.
6. Robots-quota + providers + local cache (largest, most independent — parallelizable).
7. `search:benchmark` harness + ground-truth set; **then** decide: sqlite-vec
   spike, ripgrep-FFI, selector. All three are guilty-until-proven-needed.

## 7. Open questions (need user call)

1. `memory_embeddings` dims default (1536) vs nomic-embed-text (768) — bug or
   intentional padding? Blocks trusting recall scores.
2. Is shipping a Rust `.so`/cdylib acceptable for self-hosted installs, or is
   pure-JS deployment a hard requirement? Decides rg/SQLite-vec fate.
3. External vector services (Qdrant/Pinecone) permanently out? Assumed yes.
4. Ground-truth labeling (100+ queries × 6 surfaces × 4 locales) — who labels?
   Without it the benchmark's recall/MRR numbers are fiction.
