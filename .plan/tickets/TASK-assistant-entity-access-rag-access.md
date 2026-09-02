<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant RAG Access Commands

**Status:** 📝 Not Started
**Priority:** High
**Effort:** High
**Type:** Task
**Tags:** assistant, rag, search, retrieval
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
