<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP: unified cross-surface omni-search

**Status:** Done
**Status Note (2026-11-18):** Shipped as the single `/api/v1/search` route (`src/routes/omni-search/index.ts:38`, mounted in `src/routes/v1/standalone-surface.ts:50`) with permission-scoped message/asset results and a frontend consumer (`src/frontend/alpine/omni-search.ts`, `src/views/search.html`). RAG epics remain separate future scope.
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Delivered: one permission-gated `/api/v1/search` surface over chats/messages/assets, reusing the shipped retrieval pieces. The original premise (no unified search epic) is historical; RAG retrieval/UI epics remain separate future scope. Related: epic-frontend-gallery.md, epic-frontend-admin.md. Caveats (retained from the original scope): TOCTOU: search index snapshot at query time; concurrent asset edits use last-committed state. Security: permission-gated results only; no cross-user leakage via shared index. Authorization: results filtered by chat inclusion + user/llm access permissions. Parallelism: read-only queries; no shared write state. Partial failure: per-surface failure degrades to remaining surfaces, surfaced in response. Rollback: additive surface; removal restores per-surface search. Observability: per-surface latency + hit counts logged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
**Resolved:** 2026-11-18T05:38:50.704Z Closed by ticket reconciliation on dev (2026-11-18); verification notes cite the landed commits.
