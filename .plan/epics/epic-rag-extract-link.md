<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG Detection, Extraction, Linking & Referencing

**Overview:** (see sections below)

**Status:** 📝 Draft
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** rag, extraction, entities, linking, references, enrichment
**Parent Epic:** RAG & Document Processing (epic-rag-document-processing.md)
**Related:** epic-rag-ingestion.md, epic-rag-retrieval.md, TASK-rag-context-enrichment.md, TASK-rag-unified-enrichment.md, TASK-rag-knowledge-graph.md

## Summary

Stage 2 of the RAG pipeline, between ingestion (epic-rag-ingestion: parse/chunk/store) and retrieval (epic-rag-retrieval: query/inject). Takes already-ingested documents/chunks and: detects (format, language, PII, NSFW flags), extracts (entities, keyphrases, facts, summaries), cleans up (dedup, boilerplate strip, normalization), enhances (embeddings, cross-references), and links every output back to source rows (documents, chunks, chats, stories, assets) with DB storage. Retrieval then cites these links instead of raw text blobs.

## Scope

- Detection: per-chunk format/language/PII/NSFW flags stored on chunk rows (reuse existing moderation + aux-pipeline classifiers; no new model infra).
- Extraction: entity/keyphrase/fact extractors writing to `knowledge_graph_entities/relationships` (TASK-rag-knowledge-graph schema — this epic is its consumer, not its duplicate) plus `chunk_entities` join table (chunk_id → entity_id).
- Cleanup: dedup near-identical chunks (hash), strip boilerplate, normalize whitespace/unicode; idempotent re-runnable over the corpus.
- Enhancement: embedding backfill for chunks missing vectors; stale-embedding refresh on source edit.
- Linking/referencing: every entity/fact row carries `source_document_id`, `source_chunk_id`, plus optional `chat_id`/`story_id`/`asset_id`; retrieval citation path reads these (no separate citation store).
- One background job (`extract` worker reusing cron/scheduler infra); admin review queue for low-confidence extractions (reuse attachment-review-queue UI pattern).

## Non-Goals

- No new parsers/chunkers — epic-rag-ingestion owns ingestion.
- No query-time reranking or prompt injection — epic-rag-retrieval owns retrieval.
- No new graph database; SQLite tables only.

## Design

```
src/rag/enrich/        # detect.ts, extract.ts, cleanup.ts, link.ts — one cohesive module first
```

- Pipeline order per chunk: detect → cleanup → extract → enhance → link. Each stage writes its columns/tables and is independently re-runnable (stage watermark column per chunk).
- Entity storage reuses TASK-rag-knowledge-graph tables when they land; until then `chunk_entities` + inline `facts` JSON column carry the load (no blocking).

## Acceptance Criteria

- [ ] Ingested document yields entities/facts linked to source chunk ids, queryable via API.
- [ ] Re-running extraction over the same corpus is a no-op (idempotent; test).
- [ ] Low-confidence extractions land in a review queue; approval/rejection is auditable.
- [ ] Retrieval citations resolve through link tables to source documents (no dangling refs; FK-tested).
- [ ] `bun run check` green.

## Dependencies

- Builds on epic-rag-ingestion (documents/chunks exist). Consumes TASK-rag-knowledge-graph storage when available; not blocked on it.


git issue: 4f7e4c0
