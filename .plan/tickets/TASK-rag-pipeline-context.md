# TASK: RAG Pipeline & Context Injection

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-rag-document-processing.md

## Summary

Implement RAG retrieval, context assembly, and prompt injection with citation tracking.

## Tasks

### RAG Retrieval

- [ ] Create retrieval interface (`src/rag/retrieval.ts`)
- [ ] Implement similarity search retrieval
- [ ] Add hybrid search (keyword + semantic)
- [ ] Implement reranking (cross-encoder)
- [ ] Add query intent detection
- [ ] Implement multi-query retrieval

### Context Assembly

- [ ] Create context assembler (`src/rag/context.ts`)
- [ ] Implement context window management
- [ ] Add token counting and limits
- [ ] Implement context deduplication
- [ ] Add context relevance scoring

### Prompt Injection

- [ ] Create prompt injector (`src/rag/injection.ts`)
- [ ] Implement system prompt enhancement
- [ ] Add context prefix/suffix options
- [ ] Implement template-based injection
- [ ] Add injection position control

### Citation Tracking

- [ ] Create citation tracker (`src/rag/citations.ts`)
- [ ] Implement source attribution
- [ ] Add page/section references
- [ ] Implement confidence scoring
- [ ] Add citation formatting (APA, MLA, etc.)

### RAG API

- [ ] Create RAG query API (`POST /api/rag/query`)
- [ ] Implement streaming RAG responses
- [ ] Add RAG configuration API (`GET /api/rag/config`)
- [ ] Create RAG history API (`GET /api/rag/history`)

### RAG Configuration UI

- [ ] Create RAG config UI (`src/frontend/alpine/rag.ts`)
- [ ] Add embedding model selection
- [ ] Add vector store selection
- [ ] Add retrieval settings (topK, threshold)
- [ ] Add context injection settings

## Files

- `src/rag/retrieval.ts`
- `src/rag/context.ts`
- `src/rag/injection.ts`
- `src/rag/citations.ts`
- `src/rag/api.ts`
- `src/frontend/alpine/rag.ts`

## Verification

```bash
# RAG query
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the vacation policy?", "model": "gpt-4"}'

# Streaming RAG
curl -X POST http://localhost:3000/api/rag/query/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the vacation policy?", "model": "gpt-4"}'

# Get RAG config
curl http://localhost:3000/api/rag/config
```
