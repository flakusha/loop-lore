<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Worldbook RAG decomposer

**Summary:** (none captured)
**Summary:** Decompose worldbook/character-card entries into RAG-document objects: each entry becomes a JSON-LD document with metadata (title, source, position, scope), key triggers become tags, and asset references become backlinks in the assets graph. Binds epic-rag-assets-unified-storage-and-assistant-flows (B-R2f) with epic-lore-knowledge.
**Context:** Worldbooks (SillyTavern-style lorebooks + character cards) are the densest lore source in user imports. Today they're consumed directly by `lore-activation.ts`; RAG ingestion happens separately. The decomposer unifies the path so an entry inserted into a worldbook is automatically available for semantic recall (embeddings) and keyword recall (token store) without a second ingestion pass.

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-lore-knowledge.md
**Tags:** lore-knowledge

## Summary

Flesh out epic-rag-assets B-R2f worldbook/character-card decomposer as the lorebook-to-document-object ingestion path: entries to JSON-LD + keyword triggers to tags + asset backlinks. Binds epic-rag-assets-unified-storage-and-assistant-flows x epic-lore-knowledge.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
