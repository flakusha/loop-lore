<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Unified Search Service (DB-direct / rg / BM25 / vector / decrypted)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Task
**Tags:** search, rag, bm25, vector, encryption, decrypted, unified, assistant, context
**Epic:** epic-rag-document-processing.md, epic-lore-knowledge, epic-memory-knowledge-systems

## Summary

Introduce a single `src/search/` module that exposes one typed interface for every search surface in loop-lore: direct DB query, plaintext-rg, FTS5 BM25, vector cosine, and **deterministic ciphertext-token** fuzzy search for client-pre-encrypted content. The service is consumed by the assistant's `/rag-search`, `/rag-ask`, `/rag-preview` commands (`epic-assistant-entity-access.md`), by `src/chat/` context injection (memory + lore + chat history), by `src/frontend/` gallery and other search/filter surfaces, and by future RAG retrieval (`epic-rag-retrieval.md`).

## Why this task exists (the gap)

The codebase has three disjoint search implementations and zero coverage for encrypted content beyond the plaintext-mirror pattern:

1. **FTS5 BM25 + snippet** — `src/routes/message-search/` (message content only)
2. **Vector cosine** — `src/memory/embeddings.ts` (memory embeddings only)
3. **Client-side LIKE substring** — `src/frontend/pages/gallery.ts` (`globalThis.filterAssets`)
4. **No encrypted fuzzy search** — `messages_fts` triggers (`src/db/migrations/parts/016_fts.ts`) index `content_plaintext`; client-pre-encrypted rows are **unsearchable**

The assistant, chat context injection, RAG retrieval, and gallery each reinvent or skip search. A unified service removes the duplication and unlocks encrypted recall.

## Design

### Interface

```ts
// src/search/types.ts
export type SearchMode = "exact" | "keyword" | "fuzzy" | "vector" | "hybrid";

export interface SearchQuery {
  q: string;
  mode: SearchMode;
  topK?: number;
  minScore?: number;
  filters?: Record<string, unknown>;
  /** Ciphertext-token search over client-pre-encrypted rows (opt-in per call). */
  includeEncrypted?: boolean;
}

export interface SearchHit<T = unknown> {
  id: string;
  score: number;
  source: "db" | "fts" | "vector" | "token";
  payload: T;
  /** True when the row was client-pre-encrypted and only token-matched. */
  encryptedMatch?: boolean;
}

export interface UnifiedSearchService {
  search<T>(query: SearchQuery, scope: SearchScope, opts?: { timeoutMs?: number }): Promise<SearchHit<T>[]>;
}
```

### Modes

| Mode | Implementation | Used by |
|---|---|---|
| `exact` | Direct DB query (`SELECT ... WHERE col = $1`) | precise lookups |
| `keyword` | `messages_fts` / `memories_fts` FTS5 + bm25 | message search, lore search |
| `fuzzy` | SQLite trigram (FTS5 `tokenize='trigram'`) OR Levenshtein via Bun's string distance | gallery assets, character/world names |
| `vector` | cosine over `memory_embeddings` (reuse `src/memory/embeddings.ts:rankBySimilarity`) | semantic memory recall |
| `hybrid` | Reciprocal-rank-fusion of `keyword` + `vector` + (optional `tag` filter + graph-weighted rerank) | RAG retrieval, assistant `/rag-search` |

### Deterministic Ciphertext Tokens (encrypted fuzzy search)

For client-pre-encrypted rows (currently `content_plaintext IS NULL`), derive per-message searchable tokens deterministically at encrypt time:

```ts
// src/search/encrypted-tokens.ts
export async function deriveSearchTokens(plaintext: string, userId: string): Promise<string[]> {
  // HMAC-SHA256(userKey, token) -> first 16 hex chars
  // Token = lowercase word, alphanumeric only, length >= 3
  // Returns N tokens; collisions collapse to set
}
```

Stored in a new `message_search_tokens(message_id, token, scope)` table (encrypted-token FTS5). Same `userKey` produces identical tokens, so server can match without seeing plaintext. Token derivation happens at encrypt-time and on `content_plaintext` updates; a backfill migration re-indexes existing rows.

**Security note:** HMAC-blinded tokens reveal that "two messages share a token" but not the token's value. Per-user keys prevent cross-user leakage. This is the chosen privacy/searchability tradeoff (decision 2026-09-07).

### Per-user encryption key (PREREQUISITE)

`users.encryption_secret` does **not** currently exist as a column (verified 2026-09-07 via `rg encryption_secret src/` — zero matches). Per-user HMAC keys require one of:

- **(a) Add `users.encryption_secret BLOB NOT NULL`** in `parts/NNN_search_tokens.ts` migration — generated at signup, never leaves the server, never returned to clients. Append-only, no breaking change.
- **(b) Derive from `users.password_hash`** server-side — already exists, but password_hash rotation invalidates HMAC tokens (full re-backfill needed on every password change).
- **(c) Per-row session secret** stored on `users` and rotated on login — added column, similar to (a).

**Decision pending:** default to (a) (additive column, simplest). Implementation ticket must bundle the column add into `parts/NNN_search_tokens.ts` so the search service and the secret land atomically.

### Scope

```ts
export type SearchScope =
  | { kind: "messages"; chatId?: string; userId: string }
  | { kind: "memories"; actorId: string }
  | { kind: "assets"; userId: string; visibility?: "public" | "private" | "nsfw" }
  | { kind: "characters"; userId: string }
  | { kind: "lore"; worldId?: string };
// NOTE: "documents" scope removed — documents table is owned by
// epic-rag-assets-unified-storage-and-assistant-flows.md B-R1.
// When B-R1 lands, add { kind: "documents"; tenantId?: string } here.
```

### Time Cap (3-tier config)

```ts
// src/search/config.ts
export interface SearchTimeCapConfig {
  /** Global default — applied when admin/user override unset. */
  global: { defaultMs: number; maxMs: number };
  /** Admin override (instance-level). */
  admin: { defaultMs?: number; maxMs?: number };
  /** Per-user preference. */
  user: { defaultMs?: number; maxMs?: number };
}
```

Resolved precedence: **user > admin > global**. The `defaultMs` caps typical queries; `maxMs` caps slow ones; queries that exceed `maxMs` are aborted with `SearchTimeoutError` and a partial result.

## Files

- `src/search/index.ts` — barrel facade
- `src/search/types.ts` — `SearchMode`, `SearchQuery`, `SearchHit`, scope types
- `src/search/service.ts` — `UnifiedSearchService` impl, mode dispatch + RRF fusion
- `src/search/encrypted-tokens.ts` — `deriveSearchTokens`, `reindexMessageTokens`
- `src/search/config.ts` — 3-tier time-cap config resolver
- `src/db/migrations/parts/NNN_search_tokens.ts` — adds `users.encryption_secret` + `message_search_tokens` table + FTS5 + triggers (append; never alter `016_fts`). One atomic migration.
- `src/search/service.test.ts` — unit tests (mode dispatch, RRF, timeout, scope authz)
- `src/search/encrypted-tokens.test.ts` — determinism, collision, per-user isolation
- `src/search/config.test.ts` — precedence (user > admin > global)

## Acceptance Criteria

- [ ] `searchMessages`, `searchMemories`, `searchAssets` exposed via `src/search/index.ts`
- [ ] All 5 modes work on at least one scope (message + memory covered; assets follow-up)
- [ ] Hybrid mode fuses keyword + vector via reciprocal rank fusion
- [ ] Encrypted-token fuzzy search returns hits on client-pre-encrypted rows with `encryptedMatch: true`
- [ ] Per-user HMAC keys derived from `users.encryption_secret` (added in same migration)
- [ ] Backfill migration re-indexes all existing `messages` rows with `content_plaintext IS NULL`
- [ ] 3-tier time-cap config resolves in documented precedence
- [ ] Queries exceeding `maxMs` throw `SearchTimeoutError` with partial results preserved
- [ ] Unit tests for: mode dispatch, RRF fusion, encrypted-token determinism, config precedence, scope authz

## Dependencies

- Builds on: `src/db/migrations/parts/016_fts.ts` (FTS5 schema), `src/memory/embeddings.ts` (vector cosine)
- Enables: `TASK-gallery-fuzzy-search-pagination.md`, `TASK-assistant-rag-access-extensions.md`, `epic-rag-retrieval.md`
- Schema strategy: **single atomic migration** adds `users.encryption_secret` + `message_search_tokens` + FTS5 + triggers. Never alter `016_fts` (append-only policy).
