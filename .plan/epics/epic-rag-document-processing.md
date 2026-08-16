<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG & Document Processing

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** rag, document-processing, embeddings, vector-store, search

## Summary

Enable Retrieval-Augmented Generation (RAG) with document processing, semantic search, and context injection. Support enterprise/business use cases with compliance, audit trails, and multi-tenancy.

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

## Scope

### Phase 1: Document Processing Pipeline

- Document ingestion (file upload, URL fetch)
- Format detection and parsing
- Text extraction and cleaning
- Chunking strategies (fixed, semantic, recursive)
- Metadata extraction (author, date, tags)

### Phase 2: Embedding & Vector Store

- Embedding model integration (OpenAI, local)
- Vector store abstraction (SQLite-vec, Chroma, Pinecone)
- Index management (create, update, delete)
- Similarity search API

### Phase 3: RAG Pipeline

- Query understanding and intent detection
- Retrieval strategies (similarity, hybrid, reranking)
- Context assembly and injection
- Citation and source tracking
- Response generation with references

### Phase 4: Business Features

- Access control (per-document, per-user)
- Compliance and audit trails
- Multi-tenancy support
- Document lifecycle management
- Analytics and reporting

## Architecture

### Document Processing Pipeline

```typescript
// src/rag/pipeline.ts
export interface DocumentPipeline {
  ingest(source: DocumentSource,): Promise<Document>;
  chunk(document: Document, strategy: ChunkStrategy,): Promise<Chunk[]>;
  embed(chunks: Chunk[], model: EmbeddingModel,): Promise<EmbeddedChunk[]>;
  store(chunks: EmbeddedChunk[], store: VectorStore,): Promise<void>;
  search(query: string, options: SearchOptions,): Promise<SearchResult[]>;
}

// Document sources
export type DocumentSource =
  | { type: "file"; path: string }
  | { type: "url"; url: string }
  | { type: "text"; content: string; metadata: Metadata }
  | { type: "database"; query: string; connection: string };
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

## Tasks

### Phase 1: Document Processing Pipeline

- [ ] Create `src/rag/` module structure
- [ ] Implement document ingestion API (`POST /api/documents/ingest`)
- [ ] Add file upload handler (multipart/form-data)
- [ ] Add URL fetch handler (web scraping)
- [ ] Create format detector (`src/rag/formats/detector.ts`)
- [ ] Implement PDF parser (`src/rag/formats/pdf.ts`)
- [ ] Implement DOCX parser (`src/rag/formats/docx.ts`)
- [ ] Implement TXT/MD parser (`src/rag/formats/text.ts`)
- [ ] Implement HTML parser (`src/rag/formats/html.ts`)
- [ ] Implement CSV parser (`src/rag/formats/csv.ts`)
- [ ] Implement JSON parser (`src/rag/formats/json.ts`)
- [ ] Add OCR for images (`src/rag/formats/image.ts`)
- [ ] Create text cleaner (`src/rag/cleaning.ts`)
- [ ] Implement chunking strategies (`src/rag/chunking.ts`)
  - [ ] Fixed-size chunking
  - [ ] Semantic chunking
  - [ ] Recursive character splitting
  - [ ] Sentence-aware chunking
- [ ] Add metadata extraction (`src/rag/metadata.ts`)
- [ ] Create document storage API (`GET /api/documents`, `DELETE /api/documents/:id`)

### Phase 2: Embedding & Vector Store

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

### Phase 3: RAG Pipeline

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

### Phase 3.5: Search Providers & Context Enrichment

- [ ] **TASK-rag-search-providers.md** — Web search providers (DuckDuckGo, SearXNG, Brave, Google, Bing, Tavily)
- [ ] **TASK-rag-local-search-cache.md** — Local search providers & caching (SQLite FTS5, memory/disk cache, offline mode)
- [ ] **TASK-rag-context-enrichment.md** — Context enrichment (RSS, email, Slack/Discord, databases, knowledge graph)

### Phase 4: Business Features

- [ ] Implement access control (`src/rag/access.ts`)
  - [ ] Per-document permissions
  - [ ] Per-user access levels
  - [ ] Role-based access control (RBAC)
- [ ] Add audit trails (`src/rag/audit.ts`)
  - [ ] Document access logging
  - [ ] Query logging
  - [ ] Generation logging with sources
- [ ] Implement compliance features (`src/rag/compliance.ts`)
  - [ ] Data retention policies
  - [ ] Right to deletion (GDPR)
  - [ ] Data classification labels
- [ ] Add multi-tenancy (`src/rag/tenancy.ts`)
  - [ ] Tenant isolation
  - [ ] Cross-tenant search (optional)
  - [ ] Tenant-specific embedding models
- [ ] Create document lifecycle management (`src/rag/lifecycle.ts`)
  - [ ] Version control
  - [ ] Deprecation and archival
  - [ ] Automatic re-indexing
- [ ] Add analytics and reporting (`src/rag/analytics.ts`)
  - [ ] Document usage statistics
  - [ ] Query analytics
  - [ ] Popular documents dashboard
- [ ] Create business dashboard UI (`src/frontend/alpine/rag-dashboard.ts`)

### Cross-Cutting Concerns

- [ ] Add RAG configuration to `src/config/schema.ts`
- [ ] Create RAG migration (`src/db/migrations/rag.ts`)
- [ ] Add RAG logging and observability
- [ ] Create integration test suite
- [ ] Add E2E tests for RAG pipeline
- [ ] Document RAG setup in `docs/rag/README.md`
- [ ] Document business use cases in `docs/rag/business.md`

## Files

- `src/rag/` — RAG module
- `src/rag/pipeline.ts` — document processing pipeline
- `src/rag/formats/` — document parsers
- `src/rag/chunking.ts` — chunking strategies
- `src/rag/embeddings.ts` — embedding models
- `src/rag/vector-store.ts` — vector store abstraction
- `src/rag/retrieval.ts` — RAG retrieval
- `src/rag/context.ts` — context assembly
- `src/rag/injection.ts` — prompt injection
- `src/rag/citations.ts` — citation tracking
- `src/rag/access.ts` — access control
- `src/rag/audit.ts` — audit trails
- `src/rag/compliance.ts` — compliance features
- `src/rag/tenancy.ts` — multi-tenancy
- `src/rag/lifecycle.ts` — document lifecycle
- `src/rag/analytics.ts` — analytics
- `src/frontend/alpine/rag.ts` — RAG config UI
- `src/frontend/alpine/rag-dashboard.ts` — business dashboard
- `docs/rag/` — RAG documentation

## Dependencies

- Depends on: `epic-encryption-foundation.md` (document encryption)
- Depends on: `epic-api-library-distribution.md` (API for external tools)
- Depends on: `epic-communications-integrations.md` (document ingestion via email/IM)
- Enables: Enterprise knowledge management, business automation

## Database Schema

### documents

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL, -- file, url, text, database
  source_url TEXT,
  content_hash TEXT NOT NULL,
  metadata JSONB,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT REFERENCES users(id),
  tenant_id TEXT,
  status TEXT DEFAULT 'active', -- active, archived, deleted
  version INTEGER DEFAULT 1
);
```

### chunks

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

### rag_queries

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

### rag_access

```sql
CREATE TABLE rag_access (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  role TEXT NOT NULL, -- viewer, editor, admin
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  granted_by TEXT REFERENCES users(id)
);
```

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
