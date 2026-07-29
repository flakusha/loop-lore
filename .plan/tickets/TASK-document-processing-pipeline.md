# TASK: Document Processing Pipeline

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-rag-document-processing.md

## Summary

Build document ingestion, parsing, chunking, and metadata extraction pipeline.

## Tasks

### Core Pipeline

- [ ] Create `src/rag/pipeline.ts` — document processing pipeline
- [ ] Create `src/rag/formats/` — format parsers directory
- [ ] Implement format detector (`src/rag/formats/detector.ts`)

### Ingestion

- [ ] Implement file upload handler (`POST /api/documents/ingest`)
- [ ] Add URL fetch handler (web scraping)
- [ ] Create text input handler
- [ ] Add database query handler

### Format Parsers

- [ ] Implement PDF parser (`src/rag/formats/pdf.ts`) — pdf-parse library
- [ ] Implement DOCX parser (`src/rag/formats/docx.ts`) — mammoth library
- [ ] Implement TXT/MD parser (`src/rag/formats/text.ts`)
- [ ] Implement HTML parser (`src/rag/formats/html.ts`) — cheerio
- [ ] Implement CSV parser (`src/rag/formats/csv.ts`)
- [ ] Implement JSON parser (`src/rag/formats/json.ts`)
- [ ] Add OCR for images (`src/rag/formats/image.ts`) — tesseract.js

### Text Processing

- [ ] Create text cleaner (`src/rag/cleaning.ts`)
  - Remove extra whitespace
  - Normalize Unicode
  - Remove special characters
  - Fix encoding issues

### Chunking Strategies

- [ ] Create chunking interface (`src/rag/chunking.ts`)
- [ ] Implement fixed-size chunking
- [ ] Implement semantic chunking
- [ ] Implement recursive character splitting
- [ ] Implement sentence-aware chunking
- [ ] Add chunk overlap support

### Metadata Extraction

- [ ] Create metadata extractor (`src/rag/metadata.ts`)
- [ ] Extract document title
- [ ] Extract author information
- [ ] Extract creation date
- [ ] Extract tags/keywords
- [ ] Add custom metadata support

### Document Management

- [ ] Create document storage API (`GET /api/documents`)
- [ ] Add document deletion (`DELETE /api/documents/:id`)
- [ ] Implement document versioning
- [ ] Add document status management (active, archived, deleted)

## Files

- `src/rag/pipeline.ts`
- `src/rag/formats/detector.ts`
- `src/rag/formats/pdf.ts`
- `src/rag/formats/docx.ts`
- `src/rag/formats/text.ts`
- `src/rag/formats/html.ts`
- `src/rag/formats/csv.ts`
- `src/rag/formats/json.ts`
- `src/rag/formats/image.ts`
- `src/rag/cleaning.ts`
- `src/rag/chunking.ts`
- `src/rag/metadata.ts`

## Verification

```bash
# Ingest PDF document
curl -X POST http://localhost:3000/api/documents/ingest \
  -F "file=@document.pdf" \
  -F "metadata={\"tags\": [\"policy\", \"hr\"]}"

# List documents
curl http://localhost:3000/api/documents

# Get document details
curl http://localhost:3000/api/documents/doc-abc123

# Delete document
curl -X DELETE http://localhost:3000/api/documents/doc-abc123
```
