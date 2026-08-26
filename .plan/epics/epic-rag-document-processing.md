<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG & Document Processing

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High (split into 5 sub-epics)
**Type:** Feature Epic
**Tags:** rag, document-processing, embeddings, vector-store, search

## Summary

Enable Retrieval-Augmented Generation (RAG) with document processing, semantic search, and context injection. Support enterprise/business use cases with compliance, audit trails, and multi-tenancy.

> **⚠️ This epic is too large to ship in one pass.** It has been split into 5 sub-epics below. Each sub-epic delivers independently shippable value; this hub keeps the shared pipeline interface and cross-cutting concerns.

## Motivation

Users want to:

- Ingest documents (PDF, DOCX, TXT, etc.) into loop-lore
- Search documents semantically for relevant context
- Inject retrieved context into LLM prompts
- Use loop-lore for enterprise knowledge management
- Maintain compliance and audit trails

## Core Principles

| Principle             | Implementation                                                        |
| --------------------- | --------------------------------------------------------------------- |
| **RAG Pipeline**      | Ingestion → Chunking → Embedding → Vector Store → Retrieval → Context |
| **Document Support**  | PDF, DOCX, TXT, MD, HTML, CSV, JSON, images (OCR)                     |
| **Context Injection** | Automatic retrieval based on user query                               |
| **Business Ready**    | Compliance, audit, access control, multi-tenancy                      |

## Sub-Epics

| Sub-Epic                          | Epic File                        | Scope                                                                                                        | Priority | Sequencing                       |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------- |
| **Ingestion & Document Processing** | `epic-rag-ingestion.md`        | Ingestion API, format parsers (TXT/MD/PDF/DOCX/HTML/CSV/JSON/OCR), chunking strategies, metadata, `documents` table | High   | First                            |
| **Embedding & Vector Store**      | `epic-rag-vector-store.md`       | `EmbeddingModel` interface (OpenAI/local/Ollama), `VectorStore` abstraction (SQLite-vec/Chroma/Pinecone/Weaviate), embed/index APIs, `chunks` table | High | After ingestion                |
| **Retrieval & Context Injection** | `epic-rag-retrieval.md`          | Retrieval interface, query understanding, hybrid search + reranking, context assembler, prompt injection, citations, `rag_queries` table | High | After vector store             |
| **External Search & Context Enrichment** | `epic-rag-context-sources.md` | Web search providers (DuckDuckGo/SearXNG/Brave/Tavily), local search caching, enrichment (RSS/email/Slack/Discord/DB/knowledge graph) | Medium | Independent follow-on         |
| **Enterprise Features**           | `epic-rag-enterprise.md`         | Access control, audit trails, compliance, multi-tenancy, lifecycle, analytics, dashboard UI, `rag_access` schema | Medium   | Independent follow-on            |

### Splitting Rationale

1. **Ingestion first** — nothing exists to embed until documents are parsed, chunked, and stored.
2. **Vector store second** — embedding/indexing builds directly on ingested chunks.
3. **Retrieval third** — searching requires stored embeddings; delivers the end-user-visible RAG loop.
4. **Context sources** — independent augmentation of retrieval with external providers; can land any time after retrieval.
5. **Enterprise** — independent governance layer over the pipeline; gated on document encryption (`epic-encryption-foundation.md`).

Cross-cutting configuration schema and migration scaffold live in the ingestion sub-epic (they create the RAG module's config/db footprint); testing, observability, and documentation stay in this hub below.

## Architecture

### Shared Pipeline Interface

```typescript
// src/rag/pipeline.ts
export interface DocumentPipeline {
  ingest(source: DocumentSource,): Promise<Document>;
  chunk(document: Document, strategy: ChunkStrategy,): Promise<Chunk[]>;
  embed(chunks: Chunk[], model: EmbeddingModel,): Promise<EmbeddedChunk[]>;
  store(chunks: EmbeddedChunk[], store: VectorStore,): Promise<void>;
  search(query: string, options: SearchOptions,): Promise<SearchResult[]>;
}
```

Per-subsystem interfaces (`DocumentSource`, `EmbeddingModel`, `VectorStore`, `RAGRetrieval`, `ContextInjector`) live in the sub-epic that owns them:

- Ingestion: document sources, parsers, chunking → `epic-rag-ingestion.md`
- Embedding/vector store: `EmbeddingModel`, `VectorStore` → `epic-rag-vector-store.md`
- Retrieval/context: `RAGRetrieval`, `RetrievalOptions`, `ContextResult`, `ContextInjector` → `epic-rag-retrieval.md`

## Cross-Cutting Concerns

- [ ] Add RAG logging and observability
- [ ] Create integration test suite
- [ ] Add E2E tests for RAG pipeline
- [ ] Document RAG setup in `docs/rag/README.md`
- [ ] Document business use cases in `docs/rag/business.md`

## Files

- `src/rag/` — RAG module (layout per sub-epic)
- `src/frontend/alpine/rag.ts` — RAG config UI (retrieval sub-epic)
- `src/frontend/alpine/rag-dashboard.ts` — business dashboard (enterprise sub-epic)
- `docs/rag/` — RAG documentation

## Dependencies

- Depends on: `epic-encryption-foundation.md` (document encryption; hard prerequisite of the enterprise sub-epic)
- Depends on: `epic-api-library-distribution.md` (API for external tools)
- Depends on: `epic-communications-integrations.md` (document ingestion via email/IM)
- Enables: Enterprise knowledge management, business automation

## Business Use Cases

### Enterprise Knowledge Management

- Ingest company documentation (policies, procedures, manuals)
- Enable semantic search across knowledge base
- Generate answers with source citations
- Track document usage and popular queries

### Customer Support

- Ingest product documentation and FAQs
- Auto-suggest relevant articles during support tickets
- Generate responses with source references
- Track support query patterns

### Legal & Compliance

- Ingest legal documents and contracts
- Semantic search for relevant clauses
- Generate compliance summaries
- Audit trail for document access

### Research & Analysis

- Ingest research papers and reports
- Cross-reference findings across documents
- Generate literature reviews with citations
- Track research query patterns

### Education & Training

- Ingest course materials and textbooks
- Generate study guides from documents
- Answer student questions with sources
- Track learning patterns

## Security Considerations

| Feature             | Implementation                        |
| ------------------- | ------------------------------------- |
| Document Encryption | AES-256-GCM at rest                   |
| Access Control      | RBAC with per-document permissions    |
| Audit Trails        | All queries and access logged         |
| Data Retention      | Configurable retention policies       |
| GDPR Compliance     | Right to deletion, data export        |
| Multi-tenancy       | Tenant isolation, cross-tenant search |

Implementation detail lives in the enterprise sub-epic (`epic-rag-enterprise.md`).

## Success Criteria

- [ ] Can ingest PDF, DOCX, TXT, MD, HTML, CSV, JSON documents
- [ ] Can search documents semantically
- [ ] Can inject retrieved context into LLM prompts
- [ ] Can track citations and sources
- [ ] Can enforce access control per document
- [ ] Can audit all document access and queries
- [ ] Can manage document lifecycle (version, archive, delete)
- [ ] Can view analytics dashboard
- [ ] All tests pass
- [ ] Documentation covers setup and business use cases

## Related Tasks

- **TASK-rag-pipeline-context.md** — RAG retrieval, context assembly, prompt injection
- **TASK-rag-business-features.md** — Enterprise features (access, audit, compliance)
- **TASK-rag-search-providers.md** — Web search providers integration
- **TASK-rag-local-search-cache.md** — Local search & caching for self-hosted
- **TASK-rag-context-enrichment.md** — RSS, email, chat, database, knowledge graph

## Related Epics

- **epic-encryption-foundation.md** — Document encryption at rest
- **epic-api-library-distribution.md** — API for external document ingestion
- **epic-communications-integrations.md** — Document ingestion via email/IM
- **epic-memory-foundation.md** — Memory system integration
