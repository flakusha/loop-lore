<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: B1 — RAG + Asset Access MVP

**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7`). This batch ticket is the MVP wedge, and five of its eight acceptance criteria are met by code on `dev`. Met: `/rag-search` returns ranked lore summaries (`src/assistant/commands/rag.ts:66`, tested at `rag.test.ts:126`); `/rag-ask` produces an answer over the retrieved context and lists its sources (`rag.ts:101`, tested at `rag.test.ts:212`); `/asset-list` returns assets via `listAssets` with a validated `kind` filter (`src/assistant/commands/assets.ts:22`, tested at `assets.test.ts:154` and `:168`); `/asset-preview` returns metadata plus links gated by `canAccessAsset` (`assets.ts:61`, tested at `assets.test.ts:207`); `/asset-search` returns ranked hits via the shared search service (`assets.ts:99`, tested at `assets.test.ts:247`); all five commands are registered for real because both files are imported by the command barrel (`src/assistant/commands/index.ts:9` and `:31`); the slice is read-only — no handler writes; and every handler has unit tests including access-denial cases (`rag.test.ts:163`, `:191`; `assets.test.ts:189`, `:226`, `:273`). NOT MET, and this is why the ticket is not Done: (a) "All commands respect quota" — the quota engine this depends on does not exist; there is no `src/assistant/quota/` directory and no `QuotaExceededError` anywhere in `src/`, so no pre-call enforcement happens; (b) `/rag-search` does NOT do what the criterion implies — it keyword-matches `world_lore_entries` and `actor_lore_entries` in JS (`rag.ts:32-63`), not FTS5 over `documents` rows returning `DocumentObject` summaries, and `/rag-ask` returns a system message rather than streaming. Remaining: stand up the quota engine and reconcile the retrieval layer with the `documents`/FTS5 contract.
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


git issue: fe57375
