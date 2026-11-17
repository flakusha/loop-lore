<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP: omni-search frontend consumer

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Status Note (2026-11-18):** In Progress — verification evidence: `src/frontend/alpine/omni-search.ts` is on dev (commit `cc2f34085`), imported from `src/frontend/alpine/index.ts:48`, and calls `/api/v1/search?q=…`; `omni-search.test.ts` covers the helpers and fetch URL. The old "no frontend consumer" premise is stale. Remaining AC checks (gallery/chat/admin result rendering, permission gating) are unverified, so the ticket stays open.

**Summary:**

Search UI wiring against the shipped GAP omni-search backend (git issue 9d90969, .plan/tickets/TASK-1-0-0-gap-unified-cross-surface-omni-search.md). Backend route landed on dev (commit 7e3f1c2b3; src/routes/omni-search/index.ts:38) but has no frontend consumer (no omni-search / api/v1/search in src/frontend/). Scope: one search surface over gallery + chats + admin reusing the shipped route, permission-gated results only. Related: epic-release-1-0-0 tracker (.plan/tickets/TASK-epic-release-1-0-0.md), theme-5 frontend completion (.plan/tickets/TASK-1-0-0-theme-5-frontend-completion-against-shipped-backends-c.md). Backend-first GAP 9d90969 shipped the route; this ticket is the frontend-consumer follow-up per .tmp/intercom/scripts/next-topics-research.md item C1. Acceptance: search UI calls the omni-search backend and renders gallery + chat + admin results; results permission-gated (no cross-user leakage); tests passing; docs updated. **Caveats:** TOCTOU: search index snapshot at query time; concurrent asset edits use last-committed state. Security: permission-gated results only; no cross-user leakage via shared index. Authorization: results filtered by chat inclusion + user/llm access permissions. Parallelism: read-only queries; no shared write state. Partial failure: per-surface failure degrades to remaining surfaces. Rollback: UI-only slice reverts without migration changes. Observability: frontend fetch failures surface to the user with retry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
