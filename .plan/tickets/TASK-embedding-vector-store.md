# TASK: Embedding & Vector Store

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-rag-document-processing.md

## Summary

Implement embedding models and vector store abstraction for semantic search.

## Tasks

### Embedding Models

- [ ] Create embedding interface (`src/rag/embeddings.ts`)
- [ ] Implement OpenAI embedding (`src/rag/embeddings/openai.ts`)
  - `text-embedding-3-small` (1536 dimensions)
  - `text-embedding-3-large` (3072 dimensions)
- [ ] Implement local embedding (`src/rag/embeddings/local.ts`)
  - sentence-transformers via ONNX Runtime
  - Support for `all-MiniLM-L6-v2`, `all-mpnet-base-v2`
- [ ] Implement Ollama embedding (`src/rag/embeddings/ollama.ts`)
  - Support for `nomic-embed-text`, `mxbai-embed-large`
- [ ] Add embedding caching (`src/rag/embeddings/cache.ts`)
  - SQLite cache for repeated texts
  - TTL-based expiration

### Vector Store Abstraction

- [ ] Create vector store interface (`src/rag/vector-store.ts`)
- [ ] Implement SQLite-vec store (`src/rag/vector-store/sqlite-vec.ts`)
  - Default, local, zero-config
  - Uses `sqlite-vec` extension
- [ ] Implement Chroma store (`src/rag/vector-store/chroma.ts`)
  - External Chroma server
  - REST API integration
- [ ] Implement Pinecone store (`src/rag/vector-store/pinecone.ts`)
  - External Pinecone service
  - Cloud-native vector search
- [ ] Implement Weaviate store (`src/rag/vector-store/weaviate.ts`)
  - External Weaviate server
  - GraphQL API integration

### Index Management

- [ ] Create index API (`POST /api/documents/index`)
- [ ] Implement batch embedding for large document sets
- [ ] Add embedding progress tracking
- [ ] Implement incremental indexing (new/updated documents)
- [ ] Add index statistics API (`GET /api/documents/index/stats`)

### Similarity Search

- [ ] Implement cosine similarity search
- [ ] Add dot product search
- [ ] Implement Euclidean distance search
- [ ] Add hybrid search (keyword + semantic)
- [ ] Implement reranking (cross-encoder)

## Files

- `src/rag/embeddings.ts`
- `src/rag/embeddings/openai.ts`
- `src/rag/embeddings/local.ts`
- `src/rag/embeddings/ollama.ts`
- `src/rag/embeddings/cache.ts`
- `src/rag/vector-store.ts`
- `src/rag/vector-store/sqlite-vec.ts`
- `src/rag/vector-store/chroma.ts`
- `src/rag/vector-store/pinecone.ts`
- `src/rag/vector-store/weaviate.ts`

## Verification

```bash
# Embed document chunks
curl -X POST http://localhost:3000/api/documents/embed \
  -H "Content-Type: application/json" \
  -d '{"documentId": "doc-abc123", "model": "text-embedding-3-small"}'

# Similarity search
curl -X POST http://localhost:3000/api/documents/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the vacation policy?", "topK": 5}'

# Get index stats
curl http://localhost:3000/api/documents/index/stats
```
