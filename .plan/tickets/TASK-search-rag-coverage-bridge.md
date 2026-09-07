<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Search/RAG Coverage Bridge — epic recommendation + cross-ticket glue

**Status:** ⬜ Not Started
**Priority:** High (planning only)
**Effort:** Low (planning + glue tasks; no implementation in this ticket)
**Type:** Recommendation Task
**Tags:** rag, search, planning, epic, cross-ticket, recommendation
**Epic:** epic-rag-assets-unified-storage-and-assistant-flows.md (recommended as bridge) + epic-rag-document-processing.md (core), epic-lore-knowledge

## Summary

This is a **planning / recommendation** ticket. It records the decision that **no new epic is needed** for the user's 7-item search/RAG/capabilities scope; instead 6 implementation tickets are filed under existing epics. The ticket itself does **not** ship code — it produces:

1. A **bridge recommendation** linking the existing epics into a coherent search/RAG/capability surface.
2. **Cross-ticket glue** (shared types, schema, migration strategy) so the 6 implementation tickets interlock cleanly.
3. An **order-of-execution** proposal so the worktree ships each ticket with the right prerequisites.

## Why this ticket exists (the gap)

`epic-rag-assets-unified-storage-and-assistant-flows.md` is the closest existing epic; it covers hybrid (BM25+vector+tag+graph), JSON-LD doc-objects, ModelRole expansion, gallery decomposition, and assistant tool round-trip. The user's request adds three orthogonal concerns:

- Gallery search/filter backend + relevance
- Assistant tool execution hardening (2+ level prompt injection)
- Internet-search operational correctness (robots/retry/visibility)

These concerns are **out of scope** of `epic-rag-assets` (gallery search belongs to `epic-frontend-gallery.md`; assistant hardening belongs to `epic-assistant-gm-flows.md`; internet search belongs to `epic-rag-context-sources.md`). Folding them in would bloat the epic; creating a new "Search/RAG Capabilities" epic would fragment an already-thin RAG epic stack (the existing `epic-rag-document-processing.md` family has 8 child epics).

**Decision (2026-09-07):** No new epic. 6 new tickets under existing epics.

## Bridge Recommendation

| Concern | Existing epic | New ticket |
|---|---|---|
| Unified search service (DB / rg / BM25 / vector / encrypted-tokens) | `epic-rag-document-processing.md` | `TASK-search-service-unified.md` |
| Gallery fuzzy search + pagination + backend sort | `epic-frontend-gallery.md` (Phase 3 Polish) | `TASK-gallery-fuzzy-search-pagination.md` |
| Assistant tool injection guard (3-layer) | `epic-assistant-gm-flows.md` | `TASK-assistant-tool-injection-guard.md` |
| Capability disclosure (`/capabilities`, prompt injection) | `epic-assistant-gm-flows.md` | `TASK-assistant-capability-disclosure.md` |
| Admin/mod frontend for tooling allowlist + ModelRole extension | `epic-byok-local-models.md` + `epic-assistant-gm-flows.md` | `TASK-admin-assistant-tooling-allowlist.md` |
| Internet search operational correctness | `epic-rag-context-sources.md` | `TASK-rag-search-robots-quota.md` |

## Cross-ticket glue

### Shared types — single source of truth

```ts
// src/types/search.ts
export type SearchMode = "exact" | "keyword" | "fuzzy" | "vector" | "hybrid";
export type Visibility = "public" | "private";
export type CapabilityTag =
  | "read-chat" | "write-chat" | "read-memory" | "write-memory"
  | "read-asset" | "write-asset" | "delete-asset"
  | "read-world" | "write-world" | "delete-world"
  | "read-lore" | "write-lore"
  | "read-character" | "write-character" | "delete-character"
  | "network" | "cross-user" | "irreversible" | "destructive"
  | "admin-only" | "moderator-only";
```

Each ticket imports from `src/types/search.ts`; no per-ticket redefinitions.

### Schema migration strategy — append-only

| Migration | Tables added |
|---|---|
| `parts/NNN_search_tokens.ts` (TASK-search-service-unified) | `message_search_tokens`, `documents_fts`, `document_references` |
| `parts/NNN_search_infra.ts` (TASK-rag-search-robots-quota) | `search_robots_cache`, `search_results_cache`, `search_rate_limit_state` |
| `parts/NNN_admin_assistant_tooling.ts` (TASK-admin-assistant-tooling-allowlist) | `tool_capabilities`, `user_tool_allowlists` |
| `parts/NNN_tool_audit.ts` (TASK-assistant-tool-injection-guard) | `tool_call_audit` |

Append-only — no existing tables altered. Each migration registers itself in `001_init.ts` order.

### Order of execution

1. **TASK-assistant-tool-injection-guard** — ships first; defines `CapabilityTag` + matrix used by all later tickets.
2. **TASK-search-service-unified** — ships second; defines `SearchMode` + encrypted-tokens used by gallery + RAG.
3. **TASK-gallery-fuzzy-search-pagination** — depends on (2); ships third.
4. **TASK-assistant-capability-disclosure** — depends on (1); ships fourth.
5. **TASK-admin-assistant-tooling-allowlist** — depends on (1) + (4); ships fifth.
6. **TASK-rag-search-robots-quota** — independent of (1)-(5); ships in parallel or interleaved.

## Non-goals

This ticket **does not** introduce a new epic. The recommendation is to extend the existing epic stack. If the user later determines the scope grew beyond what existing epics can hold, a follow-up ticket can split `epic-rag-assets-unified-storage-and-assistant-flows.md` into a dedicated `epic-search-rag-capabilities.md`.

## Acceptance Criteria

- [ ] This ticket records the no-new-epic decision in `.plan/backlog/`
- [ ] Shared types live in `src/types/search.ts` and are imported (not redefined) by all 6 tickets
- [ ] Migration order is documented; `001_init.ts` registers each in sequence
- [ ] Order-of-execution is reflected in `.plan/backlog/priority.md` (or equivalent)
- [ ] No code shipped; this is planning-only

## Files

- `.plan/backlog/recommendation-search-rag-capabilities-no-new-epic.md` — this decision
- `src/types/search.ts` — shared types (added when TASK-search-service-unified lands)
- Updates to: `epic-rag-assets-unified-storage-and-assistant-flows.md` "Related Epics" + "Bridges" sections to point at the 6 new tickets

## Dependencies

- Reads: all 6 new tickets in this worktree
- Writes: `.plan/backlog/recommendation-search-rag-capabilities-no-new-epic.md`
- Enables: consistent execution order across the worktree batches
