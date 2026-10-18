<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant RAG Access Commands

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7`). Two of the seven acceptance criteria are met. Met: `/rag-search` returns ranked results (`src/assistant/commands/rag.ts:66`, tested at `rag.test.ts:126`) and `/rag-ask` answers over the retrieved context listing its source documents (`rag.ts:101`, tested at `rag.test.ts:212`); both commands compose with the existing access guards — they call `requireWorldAccess` from `src/routes/worlds/access` and deny a caller who cannot access the world (`rag.test.ts:163` and `:191`); and unit tests pass for the two implemented handlers. NOT MET: (a) `/rag-preview` is not registered — `registerCommand` is called only twice in the file (`rag.ts:66` and `:101`), so no preview handler exists; (b) `/rag-decompose` is likewise unregistered, and with no decomposers on `dev` there is no stub message either; (c) quota enforcement does not exist — there is no `src/assistant/quota/` directory and no `QuotaExceededError` in `src/`, so the named prerequisite `TASK-assistant-entity-access-quota-engine` is unbuilt and nothing is blocked pre-call; (d) the retrieval contract differs from the design — `searchLore` (`rag.ts:32`) does in-JS keyword matching over the two lore tables rather than FTS5 over `documents`, and the documented `src/assistant/adapter/rag.ts` adapter file does not exist. Remaining: the preview and decompose handlers, the quota engine, and either an adapter or an amendment of the design.
**Priority:** High
**Effort:** High
**Type:** Task
**Tags:** assistant, rag, search, retrieval
**Epic:** epic-assistant-entity-access
**Related:** `epic-assistant-entity-access.md`, `epic-rag-assets-unified-storage-and-assistant-flows.md`

## Summary

Implement assistant slash commands for RAG search and retrieval: `/rag-search`, `/rag-ask`, `/rag-preview`, `/rag-decompose`. Enables the user to query indexed documents/assets at chat time and retrieve relevant context.

## Motivation

The assistant can generate new entities but cannot search existing knowledge. Users need to retrieve documents, lore entries, and asset descriptions through the assistant to inform generation, modification, and adaptation workflows.

## Design

### Commands

| Command | Subcommands | Description |
|---|---|---|
| `/rag-search <query>` | — | Hybrid search (FTS5 keyword + vector if available) over indexed documents |
| `/rag-ask <query>` | — | LLM call over retrieved context; streams answer with citations |
| `/rag-preview <doc-id>` | — | Show document content + metadata + references |
| `/rag-decompose <asset\|doc-id>` | `[kind]` | Re-run decomposer; return human-readable + structured representation |

### Retrieval Logic

```ts
async function ragSearch(query: string, opts: { topK?: number; kind?: DocumentKind }): Promise<DocumentSummary[]> {
  // 1. FTS5 keyword search over documents table
  // 2. Optional vector similarity search (when epic-rag-assets lands)
  // 3. Tag and graph-weighted rerank
  // 4. Return topK DocumentObject summaries
}
```

### Quota Enforcement

RAG searches count against a per-chat quota (see `TASK-assistant-entity-access-quota-engine`). Pre-call enforcement: `QuotaExceededError` before any retrieval.

### Fallback

Until `epic-rag-assets-unified-storage-and-assistant-flows.md` lands (FTS5 + vector + hybrid):
- FTS5 keyword search over existing `documents` rows
- No vector similarity
- No cross-encoder rerank

### Assistant Integration

`/rag-ask` uses `ModelRole.Analysis` (when promoted) or the default aux model. Response streams with citations pointing to source document IDs.

## Tasks

- [ ] Implement `ragSearchHandler` — FTS5 keyword search with topK
- [ ] Implement `ragAskHandler` — LLM over retrieved context with citations
- [ ] Implement `ragPreviewHandler` — Document preview panel
- [ ] Implement `ragDecomposeHandler` — Re-run decomposer (stub until decomposers land)
- [ ] Register all commands in the assistant command registry
- [ ] Quota enforcement pre-call
- [ ] Unit tests for all handlers

## Acceptance Criteria

- [ ] `/rag-search` returns ranked document summaries
- [ ] `/rag-ask` streams answer with citations to source documents
- [ ] `/rag-preview` shows document content + metadata
- [ ] `/rag-decompose` re-runs decomposer or returns stub message
- [ ] Quota enforcement blocks retrieval when exceeded
- [ ] All commands compose with existing access guards
- [ ] Unit tests pass

## Files

- `src/assistant/commands/rag.ts` — Command handlers
- `src/assistant/adapter/rag.ts` — RAG retrieval adapter
- `src/assistant/quota/rag-quota.ts` — Quota enforcement for RAG operations

## Dependencies

- `epic-rag-document-processing.md` — Existing `documents` table and FTS5
- `epic-rag-assets-unified-storage-and-assistant-flows.md` — DocumentObject model (future)
- `epic-assistant-entity-access-schema` — EntityAdapter interface
