<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP: unified cross-surface omni-search

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

No unified search epic exists: gallery search is Done (epic-frontend-gallery.md), /asset-search is shipped, but epic-rag-retrieval.md and epic-rag-ui.md are both Not Started. Scope: one search surface over gallery + chats + admin with permission gating, reusing the shipped retrieval pieces. Related: epic-frontend-gallery.md, epic-frontend-admin.md, .tmp/intercom/RELEASE-1.0.0.md. Caveats: TOCTOU: search index snapshot at query time; concurrent asset edits use last-committed state. Security: permission-gated results only; no cross-user leakage via shared index. Authorization: results filtered by chat inclusion + user/llm access permissions. Parallelism: read-only queries; no shared write state. Partial failure: per-surface failure degrades to remaining surfaces, surfaced in response. Rollback: additive surface; removal restores per-surface search. Observability: per-surface latency + hit counts logged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
