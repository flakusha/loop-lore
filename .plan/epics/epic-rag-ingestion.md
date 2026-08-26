<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG Ingestion & Document Processing

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** rag, ingestion, document-processing, parsing, chunking
**Parent Epic:** RAG & Document Processing (epic-rag-document-processing.md)

## Summary

First stage of the RAG pipeline: ingest documents from files, URLs, raw text, and databases; detect formats and parse them (PDF, DOCX, TXT, MD, HTML, CSV, JSON, images via OCR); clean extracted text; split it into chunks with pluggable strategies; extract metadata; persist documents in the `documents` table.

## Scope

- Document ingestion API (`POST /api/documents/ingest`) with file upload and URL fetch handlers
- Format detection and per-format parsers
- Text extraction and cleaning
- Chunking strategies (fixed, semantic, recursive character splitting, sentence-aware)
- Metadata extraction (author, date, tags)
- Document storage API (`GET /api/documents`, `DELETE /api/documents/:id`)
- RAG configuration schema and database migration scaffold

## Design

### Document Sources

```typescript
// src/rag/pipeline.ts
export type DocumentSource =
  | { type: "file"; path: string }
  | { type: "url"; url: string }
  | { type: "text"; content: string; metadata: Metadata }
  | { type: "database"; query: string; connection: string };
```

### Module Layout

```
src/rag/
├── formats/
│   ├── detector.ts   # format detection
│   ├── pdf.ts        # PDF parser
│   ├── docx.ts       # DOCX parser
│   ├── text.ts       # TXT/MD parser
│   ├── html.ts       # HTML parser
│   ├── csv.ts        # CSV parser
│   ├── json.ts       # JSON parser
│   └── image.ts      # OCR for images
├── cleaning.ts       # text cleaner
├── chunking.ts       # chunking strategies
└── metadata.ts       # metadata extraction
```

### Database Schema

#### documents

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

## Tasks

### Ingestion Pipeline

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

### Scaffold

- [ ] Add RAG configuration to `src/config/schema.ts`
- [ ] Create RAG migration (`src/db/migrations/rag.ts`)

## Dependencies

- **Parent hub:** epic-rag-document-processing.md (shared pipeline interface, cross-cutting concerns)
- **Sequencing:** This is the first sub-epic — no sibling dependencies. `epic-rag-vector-store.md` depends on this epic's output (chunks of parsed documents).
- External: none blocking; later ingestion-via-email/IM hooks land with epic-communications-integrations.md

## Related Epics

- **epic-rag-vector-store.md** — consumes this epic's chunks (next stage)
- **epic-api-library-distribution.md** — API conventions for external ingestion
