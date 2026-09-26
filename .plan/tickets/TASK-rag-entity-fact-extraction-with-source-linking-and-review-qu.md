<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RAG entity-fact extraction with source linking and review queue

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-rag-extract-link
**Tags:** rag, extraction, linking

## Summary

Extract entities/keyphrases/facts writing chunk_entities join + knowledge_graph tables (TASK-rag-knowledge-graph schema when landed; inline facts JSON until then). Every row carries source_document_id/chunk_id (+chat/story/asset refs) for retrieval citations. Low-confidence items to admin review queue (attachment-review-queue pattern). Acceptance: doc yields linked entities via API; citations resolve no dangling refs (FK test); check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
