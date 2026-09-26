<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: B1 — RAG + Asset Access MVP

**Status:** open
**Priority:** high
**Effort:** Medium
**Type:** Batch Task
**Tags:** assistant, rag, assets, access, mvp, batch-b1
**Epic:** epic-assistant-entity-access

**Summary:** MVP wedge implementing the RAG + Asset access slash commands under the entity-access epic. Builds on the schema + quota tickets. Wires `/rag-search`, `/rag-ask`, `/asset-list`, `/asset-preview`, `/asset-search` to the existing service layer.

**Context:** Source: `.plan/epics/epic-assistant-entity-access.md` §1 RAG Access, §2 Asset Access, and §Batches B1. Read-only by default (no state mutation). Reuses FTS5 keyword search over `documents` rows until `epic-rag-assets-unified-storage-and-assistant-flows.md` lands the document-as-object model. Asset search composes FTS5 + pHash hybrid.

**Acceptance Criteria:**

- [ ] `/rag-search <query>` calls `ragSearch(query, opts)` returning ranked DocumentObject summaries
- [ ] `/rag-ask <query>` calls `answerWithRAG(query)` streaming answer + citations
- [ ] `/asset-list [kind]` returns gallery-style grid via `listAssets(kind?)`
- [ ] `/asset-preview <asset-id>` returns full asset + metadata + links
- [ ] `/asset-search <query>` uses FTS5 + pHash hybrid search
- [ ] All commands respect quota via `TASK-assistant-entity-access-quota-engine`
- [ ] Read-only by default (no state mutation)
- [ ] Unit tests for each handler

## Related

- `TASK-assistant-entity-access-schema` — EntityAdapter interface + access guard composition (prerequisite)
- `TASK-assistant-entity-access-rag-access` — `/rag-search`, `/rag-ask`, `/rag-preview`, `/rag-decompose`
- `TASK-assistant-entity-access-asset-access` — `/asset-list`, `/asset-preview`, `/asset-search`, `/asset-link`
- `TASK-assistant-entity-access-quota-engine` — quota enforcement + `QuotaExceededError`
- `TASK-search-service-unified` — backend service contract
- `epic-assistant-entity-access.md`

## git issue

# TODO: file git issue when scope locked
