<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG Retrieval & Context Injection

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** rag, retrieval, hybrid-search, reranking, citations, prompt-injection
**Parent Epic:** RAG & Document Processing (epic-rag-document-processing.md)

## Summary

Third stage of the RAG pipeline: understand queries, retrieve relevant chunks (similarity and hybrid keyword+semantic search with optional cross-encoder reranking), assemble context, inject it into prompts, track citations and sources, and serve the `POST /api/rag/query` API including streaming responses. Query history persists in the `rag_queries` table.

## Scope

- RAG retrieval interface and query intent detection
- Similarity search and hybrid search (keyword + semantic)
- Cross-encoder reranking
- Context assembler and prompt injection
- Citation tracking
- RAG query API (`POST /api/rag/query`) with streaming responses
- `rag_queries` table

## Design

### RAG Retrieval

```typescript
// src/rag/retrieval.ts
export interface RAGRetrieval {
  retrieve(query: string, options: RetrievalOptions,): Promise<ContextResult>;
  assembleContext(results: SearchResult[],): Promise<string>;
  injectIntoPrompt(prompt: string, context: string,): Promise<string>;
}

export interface RetrievalOptions {
  topK: number;
  threshold: number;
  filters: Filter[];
  rerank: boolean;
  hybrid: boolean;
}

export interface ContextResult {
  context: string;
  sources: Source[];
  confidence: number;
  tokens: number;
}
```

### Context Injection

```typescript
// src/rag/context.ts
export class ContextInjector {
  constructor(
    private retrieval: RAGRetrieval,
    private promptBuilder: PromptBuilder,
  ) {}

  async injectContext(
    query: string,
    systemPrompt: string,
    options: InjectionOptions,
  ): Promise<{ system: string; context: string; sources: Source[] }> {
    // 1. Retrieve relevant documents
    const results = await this.retrieval.retrieve(query, options,);

    // 2. Assemble context
    const context = await this.retrieval.assembleContext(results,);

    // 3. Inject into prompt
    const enhancedPrompt = await this.retrieval.injectIntoPrompt(
      systemPrompt,
      context,
    );

    return {
      system: enhancedPrompt,
      context,
      sources: results.sources,
    };
  }
}
```

### Database Schema

#### rag_queries

```sql
CREATE TABLE rag_queries (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  tenant_id TEXT,
  results JSONB,
  sources JSONB,
  confidence FLOAT,
  tokens_used INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Tasks

### RAG Pipeline

- [ ] Create RAG retrieval interface (`src/rag/retrieval.ts`)
- [ ] Implement similarity search
- [ ] Implement hybrid search (keyword + semantic)
- [ ] Add reranking (cross-encoder)
- [ ] Create context assembler (`src/rag/context.ts`)
- [ ] Implement prompt injection (`src/rag/injection.ts`)
- [ ] Add citation tracking (`src/rag/citations.ts`)
- [ ] Create RAG API (`POST /api/rag/query`)
- [ ] Implement streaming RAG responses
- [ ] Add query intent detection
- [ ] Create RAG configuration UI (`src/frontend/alpine/rag.ts`)

## Dependencies

- **Parent hub:** epic-rag-document-processing.md (shared pipeline interface, cross-cutting concerns)
- **Sequencing:** Depends on epic-rag-vector-store.md — searches the embedded/indexed chunks it produces. epic-rag-ingestion.md is a transitive prerequisite.
- Siblings: epic-rag-context-sources.md augments retrieval results with external providers; epic-rag-enterprise.md layers access control on queries

## Related Epics

- **epic-rag-vector-store.md** — provides similarity search over stored embeddings
- **epic-rag-ui.md** — frontend search interface with citations
