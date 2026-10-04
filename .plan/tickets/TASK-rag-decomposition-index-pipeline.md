<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RAG Decomposition + Semantic-Index Pipeline (backend)

**Status:** Not Started
**Priority:** High
**Effort:** High
**Type:** Task
**Tags:** rag, decomposition, semantic-index, embeddings, hybrid-search
**Epic:** epic-rag-assets-unified-storage-and-assistant-flows
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Build the decomposition + semantic-indexing backend that the assistant
`/rag-*` slash commands call: per-kind decomposers turning raw artifacts
into `structRepr` (JSON-LD) + `humanRepr` (CommonMark) + references, chunk
persistence, embedding/vector indexing, and hybrid retrieval
(`ragSearch` / `answerWithRAG` / `decomposeDocument`).

## Context

Design source: `epic-rag-assets-unified-storage-and-assistant-flows.md`
(Document-as-object, per-kind decomposer table, `documents` +
`documents_fts` + `chunks` + `document_references` schema, hybrid
`score(d)` formula, B-R2/B-R3 batches). Gap at HEAD (grep-verified): no
`decomposeDocument` / `ragSearch` / `answerWithRAG` / `DocumentObject` /
`structRepr` implementation exists in `src/` — `src/rag/search/` holds only
the web-search fallback orchestrator (`orchestrator.ts`: external providers
+ quarantine, unrelated to doc RAG). `epic-assistant-entity-access.md` §1
specifies the command surface (`/rag-search`, `/rag-ask`, `/rag-preview`,
`/rag-decompose`) with FTS5 fallback until this pipeline lands. `documents` /
`chunks` tables do not exist at HEAD (no `createTable("documents"` in
`src/db/migrations/001_init.ts`) — table creation is in scope here; the
embedding transport exists (`ModelRole.Embeddings` in `src/db/enums-core/flags.ts`,
`src/memory/embeddings.ts` for actor memories).

## Scope boundary (vs wrapper ticket — reference, don't duplicate)

- `TASK-assistant-entity-access-batch-rag-asset.md` (B1 wrapper) owns the
  slash-command handlers (`/rag-search`, `/rag-ask`, `/asset-list`,
  `/asset-preview`, `/asset-search`), quota wiring, and read-only gating.
  It calls into the service functions this ticket implements.
- THIS ticket owns everything behind those functions: decomposer
  dispatcher + per-kind decomposers, chunking, embedding/index writes,
  hybrid retrieval, `documents`/`chunks`/`document_references` persistence.
- Do NOT touch command handlers, quota engine, or asset gallery UI here.

## Acceptance Criteria

- [ ] Decomposer dispatcher `(rawRepr, kind, opts) -> { structRepr, humanRepr, references }` with pluggable per-kind registry; `file` kind reuses `epic-rag-ingestion.md` parsers (no duplication), `worldbook` splits entries to keyword triggers + content
- [ ] Semantic indexing: chunks persisted per document, embeddings written via `ModelRole.Embeddings`, vectors queryable for similarity (reuses `epic-rag-vector-store.md` index)
- [ ] Hybrid retrieval `ragSearch(query, opts)` scores vector + FTS5 (`documents_fts`) + tag overlap + graph distance per the epic's `score(d)` formula; `answerWithRAG` streams answer + citations over retrieved context
- [ ] `decomposeDocument(target, kind?)` re-runs the decomposer, bumps `documents.decomposition_version` (monotonic, history retained)
- [ ] Tests: decomposer round-trip per shipped kind (struct valid JSON-LD with `@id` refs), FTS5-only fallback when vectors unavailable, version-bump idempotency

## Related

- `epic-rag-assets-unified-storage-and-assistant-flows.md` (design: B-R2 decomposers, B-R3 model roles, B-R4 retrieval)
- `TASK-assistant-entity-access-batch-rag-asset.md` (B1 command wrapper — calls this backend)
- `epic-rag-ingestion.md` (file parsers to wrap), `epic-rag-vector-store.md` (vector side), `epic-assistant-entity-access.md` §1 (command contract)
