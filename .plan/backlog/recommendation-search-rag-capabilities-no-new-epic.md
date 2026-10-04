<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Recommendation: Search/RAG Capabilities — No New Epic

**Decision (2026-09-07, recorded 2026-10-04):** the user's 7-item search/RAG/capabilities scope does NOT get a new epic. Six implementation tickets are filed under existing epics; this file records the bridge decision per `TASK-search-rag-coverage-bridge.md`.

## Concern → epic → ticket

| Concern | Existing epic | Ticket |
|---|---|---|
| Unified search service (DB / rg / BM25 / vector / encrypted-tokens) | `epic-rag-document-processing.md` | `TASK-search-service-unified.md` |
| Gallery fuzzy search + pagination + backend sort | `epic-frontend-gallery.md` (Phase 3 Polish) | `TASK-gallery-fuzzy-search-pagination.md` |
| Assistant tool injection guard (3-layer) | `epic-assistant-gm-flows.md` | `TASK-assistant-tool-injection-guard.md` |
| Capability disclosure (`/capabilities`, prompt injection) | `epic-assistant-gm-flows.md` | `TASK-assistant-capability-disclosure.md` |
| Admin/mod frontend for tooling allowlist + ModelRole extension | `epic-byok-local-models.md` + `epic-assistant-gm-flows.md` | `TASK-admin-assistant-tooling-allowlist.md` |
| Internet search operational correctness (robots/retry/visibility) | `epic-rag-context-sources.md` | `TASK-rag-search-robots-quota.md` |

## Order of execution

1. `TASK-assistant-tool-injection-guard` — defines `CapabilityTag` + capability matrix used by later tickets.
2. `TASK-search-service-unified` — defines `SearchMode` + encrypted tokens used by gallery + RAG.
3. `TASK-gallery-fuzzy-search-pagination` — depends on (2).
4. `TASK-assistant-capability-disclosure` — depends on (1).
5. `TASK-admin-assistant-tooling-allowlist` — depends on (1) + (4).
6. `TASK-rag-search-robots-quota` — independent of (1)–(5); parallel or interleaved.

## Landing state (audited 2026-10-04)

- `TASK-search-service-unified` — In Progress: unified search module landed at `src/search/` (exact/keyword/fuzzy/vector/hybrid, per-surface providers + convenience wrappers); `message_search_tokens` created in migration `001_init.ts`; backend route `GET /api/assets/search` (`src/routes/asset-search/index.ts`) live. Assistant/RAG consumers pending.
- Gallery frontend still filters client-side (`src/frontend/pages/gallery.ts` `filterAssets`); `/api/assets/search` has no frontend consumer yet.
- Shared types: `SearchMode` landed at `src/search/types.ts` (same union the bridge planned for `src/types/search.ts` — divergent path, no per-ticket redefinitions). `Visibility`/`CapabilityTag` land with their owning tickets.
- Remaining planned tables (`documents_fts`, `document_references`, `search_robots_cache`, `search_results_cache`, `search_rate_limit_state`, `tool_capabilities`, `user_tool_allowlists`, `tool_call_audit`) ship with their owning tickets; append-only policy per `src/db/migrations/README.md`.
- The other five tickets: Not Started.
