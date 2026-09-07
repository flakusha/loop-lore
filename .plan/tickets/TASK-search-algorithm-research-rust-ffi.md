<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Search Algorithm Deep Research — Multi-Algorithm + Rust FFI `rg` + TS Fallback + Dynamic Per-Task Selection

**Status:** ⬜ Not Started
**Priority:** Medium (research) → High (impl)
**Effort:** High (research) + Very High (impl + dynamic selector)
**Type:** Research + Feature Task
**Tags:** search, ripgrep, rust, ffi, bun, performance, research, algorithm-comparison, dynamic-selection, rag, context-management, asset-search, chat-search
**Epic:** epic-platform-research.md (research) + epic-rag-document-processing.md (impl)

## Summary

Conduct a deep research pass over **all** viable search algorithms (BM25 variants, vector ANN, hybrid RRF, SPLADE, ColBERT, trigram, Levenshtein, suffix-array, regex via Rust FFI, Tantivy, MeiliSearch, Jina AI embeddings, ONNX runtime) and benchmark them across **every loop-lore search surface**: RAG retrieval, chat-context management (memory + lore injection), asset search, chat-message search, character/world/lorebook lookup, admin/moderator tooling, encrypted-content token search, internet-search result cache lookup.

Ship the research output as a **dynamic per-task selector**: instead of a fixed-per-scope algorithm choice, every search request declares its intent (`realtime-chat-injection`, `rag-deep-retrieval`, `gallery-fuzzy`, `exact-asset-lookup`, …) and the selector chooses the algorithm at runtime based on (a) measured benchmark results on loop-lore's data, (b) per-LLM context budget (composes with `TASK-chat-context-preference-per-scope.md`), (c) per-deployment capability flags (Rust binary present? ONNX runtime? vector store?), (d) user-configurable overrides.

Specifically integrate Rust's `ripgrep` library via Bun FFI (`bun:ffi`) for fast regex search with a slower TypeScript fallback so the feature works in pure-JS deployments too. `rg` is the fast, effective baseline — but **not** the only algorithm in the selector.

## Why this task exists (the gap)

User feedback (2026-09-07): "do not stop only on `rg` — it's fast and effective, but any other algos must be added to the RAG/context management/asset search/chat search/… as well to be able to dynamically select tooling for the task".

Concretely:

- `TASK-search-service-unified.md` declares `fuzzy` mode as "SQLite trigram OR Levenshtein via Bun's string distance" — **no benchmark evidence** either approach is best for loop-lore's data
- No Rust integration exists today; `ripgrep` is the obvious fast-substring/regex choice for asset/character/world name search
- No documented comparison of search algorithms against loop-lore's specific access patterns
- No **dynamic selector** — fixed-per-scope choice can't adapt to query shape, corpus size, latency budget, or deployment capability
- RAG retrieval, context management, asset search, chat search each have distinct algorithms but no shared selector

## Research phase

### Algorithms to evaluate (expanded matrix)

The selector must consider all of the following, not just `rg`:
| **SQLite-vec** | vector | Embedded HNSW implementation; no external service; zero ops | Memory embeddings (small/medium corpus; default for ≤100k vectors) |
| **HNSW** (vector ANN) | vector | Sub-linear vector search via external service (Pinecone, Weaviate, Qdrant) | Memory embeddings at scale (>100k vectors); multi-region replication |
| **ripgrep via Rust FFI** | regex/fuzzy | 10–100× faster than naive regex; Unicode-aware; PCRE2 | Asset filename + character name fuzzy search; binary-content search; metadata fields |
| **SQLite FTS5 trigram** | fuzzy | Built-in; works on `content` directly | Fuzzy message/lore search |
| **Levenshtein (Bun native)** | fuzzy | `bun:stringDistance` (verify) | Short-string fuzzy; tag/entity lookup |
| **Tantivy (Rust)** | BM25 + faceting | Native BM25 + faceting + snippet; faster than FTS5 at scale | Lorebook + character/world search at scale (>100k docs) |
| **Suffix array (custom)** | substring | O(m) substring lookup; cache-friendly | Large document corpus; lorebooks; world-time event search |
| **HNSW** (vector ANN) | vector | Sub-linear vector search | Memory embeddings at scale (>10k vectors) |
| **SQLite-vec** | vector | Embedded; no external service | Memory embeddings (small/medium corpus) |
| **SPLADE** (sparse neural) | neural-sparse | Better recall than BM25; smaller index than dense | RAG retrieval when embeddings unavailable |
| **ColBERT** (late interaction) | neural | Best recall on long-context | RAG retrieval with quality > latency |
| **Jina AI embeddings** | dense neural | Multilingual; long-context; SOTA recall | Cross-locale RAG; multilingual chat |
| **ONNX runtime** (sentence-transformers) | dense neural | Local; no API cost | Privacy-sensitive RAG; offline mode |
| **MeiliSearch** (optional external) | keyword+fuzzy | Faceting; typo tolerance; low-ops | Optional gallery/backend replacement |
| **Encrypted-token HMAC** (per `TASK-search-service-unified.md`) | token | Privacy-preserving search over ciphertext | Client-pre-encrypted messages |
| **Hybrid RRF** | meta | Fuses keyword + vector via reciprocal rank fusion | RAG retrieval; assistant `/rag-search` |

**Decision per scope is NOT fixed** — see "Dynamic selector" section.

### Search surfaces (every loop-lore search call site)

| Surface | SearchService scope | Typical query | Latency budget |
|---|---|---|---|
| **RAG retrieval** (`/api/rag/query`) | `{ kind: "documents" }` (future) / `{ kind: "messages", chatId }` | natural-language question | 500ms–2s |
| **RAG deep-research** (`/api/rag/research`) | multi-source | multi-step research query | 5s–30s |
| **Chat-context injection** (memory + lore) | `{ kind: "memories", actorId }`, `{ kind: "lore", worldId }` | current turn context | 50–200ms (per turn) |
| **Chat-message search** (`/api/messages/search`) | `{ kind: "messages", chatId?, userId }` | FTS5 BM25 + filters | 100–500ms |
| **Gallery asset search** | `{ kind: "assets", userId, visibility? }` | filename, tags, metadata | 100–300ms |
| **Character lookup** | `{ kind: "characters", userId }` | name, tag | 50–200ms |
| **World lookup** | `{ kind: "worlds", userId }` | name, description | 50–200ms |
| **Lorebook / worldbook** | `{ kind: "lore", worldId }` | lore entry keyword | 50–200ms |
| **Encrypted message search** | `{ kind: "messages", chatId?, userId, includeEncrypted: true }` | token-based | 100–500ms |
| **Internet search cache lookup** | provider results | query | 50–200ms |
| **Admin/mod audit search** | `{ kind: "tool_call_audit", userId }` | filter | 100–500ms |
| **Internet search (provider)** | external API | natural-language | 500ms–3s |
| **Code search (agentic workspace)** | per-workspace repo | regex/fuzzy in code | 100–500ms |

### Benchmark protocol

```ts
// src/search/research/benchmark.ts
export interface BenchmarkConfig {
  algorithm: SearchAlgorithm;
  surface: SearchSurface;                       // see table above
  dataset: string;                              // e.g. "messages:dev-fixture"
  querySet: string[];                           // 100+ queries
  topK: number;
  /** Repeat N times for stable latency measurements. */
  repetitions: number;
  /** Latency budget in ms (used to compute SLO hit rate). */
  latencyBudgetMs: number;
}

export interface BenchmarkResult {
  algorithm: SearchAlgorithm;
  surface: SearchSurface;
  dataset: string;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  /** Recall@10 vs ground truth (built from human-labeled set). */
  recallAt10: number;
  /** MRR (Mean Reciprocal Rank). */
  mrr: number;
  /** NDCG@10. */
  ndcgAt10: number;
  /** Index size in MB. */
  indexSizeMb: number;
  /** Whether FFI/native binary required. */
  requiresNativeBinary: boolean;
  /** Whether network required (for API-based embeddings). */
  requiresNetwork: boolean;
  /** SLO hit rate (% of queries within latency budget). */
  sloHitRate: number;
}
```

### Research deliverables

1. **Research doc** — `docs/meta/code-practices-improvements/search-algorithm-comparison.md`
   - Expanded algorithm matrix (above table with measured numbers)
   - Per-surface measurements (latency p50/p95/p99, recall@10, MRR, NDCG@10, SLO hit rate)
   - Decision: **dynamic selector rules** (not fixed-per-scope)
   - Cost/complexity tradeoffs per algorithm
   - Roadmap for new algorithm adoption (e.g. when to upgrade to Tantivy, when to enable ColBERT)

2. **Ground-truth dataset** — `.tmp/search-ground-truth/` (gitignored) with:
   - 100+ hand-labeled queries per surface (message + asset + character + lorebook + RAG + encrypted)
   - Multi-language (en, ja, zh, es) — tests multilingual coverage
   - Reusable for regression detection

3. **Benchmark harness** — `src/search/research/benchmark.ts` — runnable via `bun run search:benchmark`

## Dynamic per-task selector (the key new piece)

Instead of fixed-per-scope algorithm choice, every search call declares its **intent** and the selector chooses at runtime:

```ts
// src/search/selector.ts
export type SearchIntent =
  | "realtime-chat-injection"     // 50–200ms hard budget
  | "user-interactive"             // 100–500ms
  | "rag-deep-retrieval"           // 500ms–2s
  | "rag-research"                 // 5s–30s
  | "admin-audit"                  // 100–500ms
  | "background-batch"             // no hard budget
  | "encrypted-private"            // token-based only
  | "exact-lookup";                // direct DB query

export interface SelectorInput {
  intent: SearchIntent;
  surface: SearchSurface;
  queryShape: { tokens: number; hasRegex: boolean; isMultiWord: boolean; language?: string };
  corpusStats: { sizeBytes: number; docCount: number; vectorCount?: number };
  deployment: {
    rustBinaryAvailable: boolean;
    onnxRuntimeAvailable: boolean;
    vectorStoreAvailable: boolean;
    internetAvailable: boolean;
  };
  latencyBudgetMs: number;
  /** User override — bypass selector. */
  userOverride?: SearchAlgorithm;
}

export interface SelectorDecision {
  algorithm: SearchAlgorithm;
  backend: "native-rust" | "native-onnx" | "sqlite-fts5" | "sqlite-vec" | "ts-fallback" | "external-api";
  /** Why this algorithm (for logging + debugging). */
  rationale: string;
  /** Estimated p95 latency (from research doc). */
  estimatedP95Ms: number;
  /** Whether to degrade to a simpler algorithm on failure. */
  fallbackChain: SearchAlgorithm[];
}

export async function selectSearchAlgorithm(
  input: SelectorInput,
  benchmarkResults: BenchmarkResult[],
): Promise<SelectorDecision>;
```

**Selection logic:**

1. **Filter eligible algorithms** — by `requiresNativeBinary` × `deployment.rustBinaryAvailable`, by `requiresNetwork` × `deployment.internetAvailable`, by surface support
2. **Score remaining algorithms** — by `sloHitRate` within `latencyBudgetMs`, by `recallAt10` (with intent-specific weighting), by `indexSizeMb` (corpus-fit penalty)
3. **Apply user override** if set
4. **Return ranked fallback chain** for graceful degradation

**Selector is data-driven** — reads benchmark results from `src/search/research/results.json` (generated by `bun run search:benchmark`). Re-running the benchmark refreshes the selector automatically.

### Rust FFI integration

```ts
// src/search/native/ripgrep.ts
export interface RipgrepMatch {
  path: string;
  lineNumber: number;
  line: string;
  groups: string[];
  score?: number;
}

export interface RipgrepOptions {
  pattern: string;
  mode: "regex" | "fuzzy" | "exact";
  paths: string[];
  maxResults?: number;
  caseInsensitive?: boolean;
  utf8?: boolean;
}

export interface RipgrepBackend {
  search(opts: RipgrepOptions): Promise<RipgrepMatch[]>;
  isNative: boolean;
}
```

**Two backends:**

1. **Native (Rust via `bun:ffi`)** — `src/search/native/ripgrep-native.ts`
   - Compiles `rg` source or vendored `grep` crate
   - Loaded via `bun:ffi dlopen`
   - ~10× faster than TS on large corpora
   - Falls back to TS if binary missing / load fails

2. **TS fallback** — `src/search/native/ripgrep-fallback.ts`
   - Pure-TS implementation of the same interface
   - Slower but works in pure-JS / restricted environments
   - Uses Bun's built-in string operations + custom fuzzy matcher

**Selection logic:**

```ts
// src/search/native/index.ts
export async function loadRipgrepBackend(): Promise<RipgrepBackend> {
  try {
    const native = await import("./ripgrep-native");
    if (await native.isAvailable()) { return native.create(); }
  } catch (e) {
    getLogger().warn("ripgrep native backend unavailable; using TS fallback", { error: (e as Error).message });
  }
  const fallback = await import("./ripgrep-fallback");
  return fallback.create();
}
```

### Integration with TASK-search-service-unified.md

The unified service's mode dispatch is replaced by the dynamic selector:

- `exact` mode → still direct DB query
- `keyword` mode → selector picks: FTS5 BM25 (small) / Tantivy (large) / ripgrep (metadata fields)
- `fuzzy` mode → selector picks: SQLite trigram / ripgrep fuzzy / Levenshtein (Bun)
- `vector` mode → selector picks: SQLite-vec (small) / HNSW (large) / Jina (multilingual) / ONNX (local)
- `hybrid` mode → selector picks: RRF fusion of best keyword + vector per current corpus

The selector runs per-call, not per-deploy — same deployment may use FTS5 for one query and ripgrep for the next based on query shape and corpus stats.

### Build/CI

- Native binary built via `bun build --compile` or `cargo build` in `src/search/native/`
- CI matrix: build native on linux-x64, linux-arm64, macos-x64, macos-arm64; TS fallback always works
- Binary shipped as a sibling artifact; not bundled into the JS

## Files

### Research

- `docs/meta/code-practices-improvements/search-algorithm-comparison.md`
- `src/search/research/benchmark.ts`
- `src/search/research/results.json` — generated benchmark data, consumed by selector
- `src/search/research/ground-truth/` — labeled dataset
- `.tmp/search-ground-truth/` — scratchpad (gitignored)

### Selector

- `src/search/selector.ts` — `selectSearchAlgorithm`, `SelectorInput`, `SelectorDecision`
- `src/search/selector.test.ts` — selector rule tests (every intent × every deployment config)

### Native integration

- `src/search/native/ripgrep.ts` — interface + types
- `src/search/native/ripgrep-native.ts` — Rust FFI backend
- `src/search/native/ripgrep-fallback.ts` — TS fallback
- `src/search/native/index.ts` — backend selection
- `src/search/native/rust/` — Rust source (if vendoring `grep` crate)
- `src/search/native/build.sh` — compile script (or `package.json` script)

### Tests

- `src/search/research/benchmark.test.ts` — benchmark harness correctness
- `src/search/native/ripgrep-native.test.ts` — FFI binding tests
- `src/search/native/ripgrep-fallback.test.ts` — TS fallback correctness
- `src/search/native/index.test.ts` — selection logic (native unavailable → fallback)

## Acceptance Criteria

### Research

- [ ] Research doc compares ≥ 10 algorithms on loop-lore's actual data with measurements
- [ ] Per-surface measurements for all 13 surfaces (RAG, context, gallery, chat, character, world, lorebook, encrypted, internet cache, audit, etc.)
- [ ] Multilingual coverage tested (en + ja + zh + es)
- [ ] Decision: dynamic selector rules recorded (NOT fixed-per-scope)
- [ ] Benchmark harness reproducible: `bun run search:benchmark` runs in <10 min

### Dynamic selector

- [ ] `selectSearchAlgorithm` API: 8 intents × 13 surfaces × 4 deployment configs
- [ ] Selector reads `results.json`; re-running benchmark refreshes decisions
- [ ] User override supported
- [ ] Fallback chain per decision; graceful degradation
- [ ] All existing tests still pass

### Native integration

- [ ] Native ripgrep backend loads via `bun:ffi`; falls back to TS on failure
- [ ] Native backend ≥ 5× faster than TS fallback on 10k-line corpus (measured)
- [ ] Pure-JS deployment works with TS fallback only (no native binary required)
- [ ] `fuzzy` mode in TASK-search-service-unified routes through selector → RipgrepBackend when appropriate
- [ ] CI matrix builds native for linux-x64, linux-arm64, macos-x64, macos-arm64

### Integration

- [ ] `TASK-search-service-unified.md` mode dispatch delegates to selector
- [ ] `TASK-chat-context-preference-per-scope.md` per-scope caps influence selector (smaller budget → faster algorithm)
- [ ] RAG retrieval, chat-context injection, gallery search, character/world lookup, encrypted-token search, internet cache lookup all routed through selector

## Dependencies

- Builds on: `TASK-search-service-unified.md` (unified search service)
- Builds on: `TASK-chat-context-preference-per-scope.md` (latency budget input to selector)
- Research inputs: `epic-platform-research.md` candidate-features table (search-related)
- Bridges: `epic-byok-local-models.md` (ONNX local embedding path for selector's local-embedding option)
