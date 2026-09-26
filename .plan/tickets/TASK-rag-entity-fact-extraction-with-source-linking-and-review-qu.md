<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RAG entity-fact extraction with source linking and review queue

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-rag-extract-link
**Tags:** rag, extraction, linking

**Summary:** Extract entities/keyphrases/facts writing chunk_entities join + knowledge_graph tables (TASK-rag-knowledge-graph schema when landed; inline facts JSON until then). Every row carries source_document_id/chunk_id (+chat/story/asset refs) for retrieval citations. Low-confidence items to admin review queue (attachment-review-queue pattern).

**Context:** Retrieval must cite linked source chunks instead of raw text blobs; low-confidence extractions need human review before they pollute the graph. Entity storage reuses TASK-rag-knowledge-graph tables when available, without blocking on them.

**Acceptance Criteria:**

- [ ] Ingested document yields entities/facts linked to source chunk ids, queryable via API.
- [ ] Retrieval citations resolve through link tables with no dangling refs (FK test).
- [ ] `bun run check` green.
