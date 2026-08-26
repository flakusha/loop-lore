<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG Embedding & Vector Store

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** rag, embeddings, vector-store, sqlite-vec, chroma, pinecone, weaviate
**Parent Epic:** RAG & Document Processing (epic-rag-document-processing.md)

## Summary

Second stage of the RAG pipeline: embed document chunks with pluggable embedding models (OpenAI, local ONNX, Ollama) and store them behind a vector store abstraction (SQLite-vec default, Chroma/Pinecone/Weaviate external). Exposes embed and index-management APIs; persists chunks in the `chunks` table.

## Scope

- Embedding model interface and OpenAI / local (ONNX) / Ollama implementations
- Vector store abstraction with four implementations
- Embedding API (`POST /api/documents/embed`) and index management API (`GET /api/documents/index`)
- Batch embedding for large document sets
- Embedding caching
- `chunks` table

## Design

### Embedding Models

```typescript
// src/rag/embeddings.ts
export interface EmbeddingModel {
  name: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// Implementations
export class OpenAIEmbedding implements EmbeddingModel { ... }
export class LocalEmbedding implements EmbeddingModel { ... }
export class OllamaEmbedding implements EmbeddingModel { ... }
```

### Vector Store Abstraction

```typescript
// src/rag/vector-store.ts
export interface VectorStore {
  name: string;
  connect(config: VectorStoreConfig): Promise<void>;
  add(chunks: EmbeddedChunk[]): Promise<void>;
  search(query: Embedding, options: SearchOptions): Promise<SearchResult[]>;
  delete(ids: string[]): Promise<void>;
  update(id: string, chunk: EmbeddedChunk): Promise<void>;
  listCollections(): Promise<Collection[]>;
}

// Implementations
export class SqliteVecStore implements VectorStore { ... }
export class ChromaStore implements VectorStore { ... }
export class PineconeStore implements VectorStore { ... }
export class WeaviateStore implements VectorStore { ... }
```

### Database Schema

#### chunks

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  metadata JSONB,
  embedding_id TEXT, -- reference to vector store
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Tasks

### Embedding & Vector Store

- [ ] Create embedding model interface (`src/rag/embeddings.ts`)
- [ ] Implement OpenAI embedding (`text-embedding-3-small`, `text-embedding-3-large`)
- [ ] Implement local embedding (sentence-transformers via ONNX)
- [ ] Implement Ollama embedding
- [ ] Create vector store interface (`src/rag/vector-store.ts`)
- [ ] Implement SQLite-vec store (default, local)
- [ ] Implement Chroma store (external)
- [ ] Implement Pinecone store (external)
- [ ] Implement Weaviate store (external)
- [ ] Add embedding API (`POST /api/documents/embed`)
- [ ] Create index management API (`GET /api/documents/index`)
- [ ] Implement batch embedding for large document sets
- [ ] Add embedding caching

## Dependencies

- **Parent hub:** epic-rag-document-processing.md (shared pipeline interface, cross-cutting concerns)
- **Sequencing:** Depends on epic-rag-ingestion.md — embeds and indexes the chunks/documents that ingestion produces. `epic-rag-retrieval.md` depends on this epic.
- External: BYOK API keys for hosted embeddings (epic-byok-api-keys.md); local models align with epic-byok-local-models.md

## Related Epics

- **epic-rag-ingestion.md** — produces the chunks this epic embeds and stores
- **epic-rag-retrieval.md** — consumes this epic's similarity search (next stage)
