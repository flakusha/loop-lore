# RAG & Document Processing — Quick Reference

## Epic Overview

**File:** `.plan/epics/epic-rag-document-processing.md`
**Status:** Not Started
**Priority:** High
**Effort:** High

## Four Phases

### Phase 1: Document Processing Pipeline

- **Focus:** Ingestion, parsing, chunking, metadata
- **Tasks:** 24 tasks
- **Formats:** PDF, DOCX, TXT, MD, HTML, CSV, JSON, images (OCR)
- **File:** `TASK-document-processing-pipeline.md`

### Phase 2: Embedding & Vector Store

- **Focus:** Embedding models, vector storage, similarity search
- **Tasks:** 16 tasks
- **Models:** OpenAI, local (ONNX), Ollama
- **Stores:** SQLite-vec, Chroma, Pinecone, Weaviate
- **File:** `TASK-embedding-vector-store.md`

### Phase 3: RAG Pipeline

- **Focus:** Retrieval, context assembly, prompt injection
- **Tasks:** 14 tasks
- **Features:** Similarity search, hybrid search, reranking, citations
- **File:** `TASK-rag-pipeline-context.md`

### Phase 4: Business Features

- **Focus:** Enterprise features, compliance, analytics
- **Tasks:** 18 tasks
- **Features:** Access control, audit trails, multi-tenancy, lifecycle
- **File:** `TASK-rag-business-features.md`

## Architecture

```
src/rag/
├── pipeline.ts           # Document processing pipeline
├── formats/              # Document parsers
│   ├── detector.ts
│   ├── pdf.ts
│   ├── docx.ts
│   ├── text.ts
│   ├── html.ts
│   ├── csv.ts
│   ├── json.ts
│   └── image.ts
├── cleaning.ts           # Text cleaning
├── chunking.ts           # Chunking strategies
├── metadata.ts           # Metadata extraction
├── embeddings.ts         # Embedding interface
├── embeddings/
│   ├── openai.ts
│   ├── local.ts
│   ├── ollama.ts
│   └── cache.ts
├── vector-store.ts       # Vector store interface
├── vector-store/
│   ├── sqlite-vec.ts
│   ├── chroma.ts
│   ├── pinecone.ts
│   └── weaviate.ts
├── retrieval.ts          # RAG retrieval
├── context.ts            # Context assembly
├── injection.ts          # Prompt injection
├── citations.ts          # Citation tracking
├── access.ts             # Access control
├── audit.ts              # Audit trails
├── compliance.ts         # Compliance features
├── tenancy.ts            # Multi-tenancy
├── lifecycle.ts          # Document lifecycle
└── analytics.ts          # Analytics
```

## RAG Pipeline Flow

```
Document → Parse → Clean → Chunk → Embed → Store
                                              ↓
User Query → Embed → Search → Retrieve → Assemble Context → Inject → LLM → Response
                                              ↓
                                         Citations
```

## Business Use Cases

| Use Case                        | Description                         |
| ------------------------------- | ----------------------------------- |
| Enterprise Knowledge Management | Company docs, policies, procedures  |
| Customer Support                | Product docs, FAQs, auto-suggest    |
| Legal & Compliance              | Contracts, compliance summaries     |
| Research & Analysis             | Papers, reports, literature reviews |
| Education & Training            | Course materials, study guides      |

## Database Schema

- `documents` — document metadata and status
- `chunks` — document chunks with embeddings
- `rag_queries` — query history and results
- `rag_access` — document access permissions

## Security Matrix

| Feature             | Implementation                        |
| ------------------- | ------------------------------------- |
| Document Encryption | AES-256-GCM at rest                   |
| Access Control      | RBAC with per-document permissions    |
| Audit Trails        | All queries and access logged         |
| Data Retention      | Configurable retention policies       |
| GDPR Compliance     | Right to deletion, data export        |
| Multi-tenancy       | Tenant isolation, cross-tenant search |

## Related Epics

- `epic-encryption-foundation.md` — Document encryption
- `epic-api-library-distribution.md` — API for ingestion
- `epic-communications-integrations.md` — Ingestion via email/IM
- `epic-memory-foundation.md` — Memory integration
