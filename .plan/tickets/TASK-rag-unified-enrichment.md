<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-rag-unified-enrichment: RAG unified context enrichment layer

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** TASK
**Tags:** rag, enrichment, query
**Epic:** epic-rag-document-processing.md
**Parent:** TASK-rag-context-enrichment (umbrella)

## Summary

Query-time enrichment pipeline that fans a RAG query out to every registered source (feeds, email, chat, knowledge graph, documents, web) with token-budget allocation and priority weighting, plus the configuration UI.

## Tasks

- [ ] Create context enrichment pipeline (`src/rag/enrichment/pipeline.ts` + `token-budget.ts`):

```typescript
export interface EnrichmentPipeline {
  enrich(query: string, options: EnrichmentOptions,): Promise<EnrichedContext>;
}

export interface EnrichmentOptions {
  sources: string[]; // Which sources to query
  maxTokens: number; // Token budget
  freshness?: "latest" | "all";
  includeGraph?: boolean; // Include knowledge graph context
  includeFeeds?: boolean; // Include RSS context
  includeChat?: boolean; // Include team chat context
}

export interface EnrichedContext {
  documents: SearchResult[];
  webResults: SearchResult[];
  feedItems: SearchResult[];
  chatMessages: SearchResult[];
  graphContext: GraphContext;
  totalTokens: number;
  sources: SourceMetadata[];
}
```

- [ ] Add enrichment to RAG query flow
  - Hook into `ContextInjector`
  - Parallel source querying
  - Token budget allocation across sources
  - Source priority weighting
- [ ] Create enrichment configuration UI (`src/frontend/alpine/enrichment.ts`)
  - Source enable/disable
  - Priority ordering
  - Token budget sliders
  - Freshness preferences
  - Source-specific settings

## Verification sketch

```bash
# Enriched RAG query
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What did the team discuss about the new API?",
    "enrichment": {
      "sources": ["chat", "feeds"],
      "maxTokens": 4000
    }
  }'
```

## Dependencies

- Depends on: TASK-rag-context-schema (interface) and at least one source child (TASK-rag-feed-sources recommended first); consumes TASK-rag-knowledge-graph output via `includeGraph`.
- Parent hub: `TASK-rag-context-enrichment.md`
