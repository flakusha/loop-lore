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

**Status Note (2026-11-18):** In Progress — verification evidence: `bun test src/frontend/alpine/omni-search.test.ts` → 8 pass / 0 fail. The frontend calls `/api/v1/search` (`src/frontend/alpine/omni-search.ts:65`), served by the omni-search route mounted in `src/routes/v1/standalone-surface.ts:50` (prefix `/api/v1`); that route calls `requireUserId` and then delegates to `searchMessages` / `searchAssets` with the caller's `userId` + `userRole` scope, so the frontend consumer supplies them. The gallery route `src/routes/asset-search/index.ts` (mounted at `/api/v1/assets/search` from `src/routes/v1/content-surface.ts:49`) is a separate endpoint with the same `requireUserId` + visibility/userRole scoping — it is NOT the path the omni-search frontend calls. Result rendering lives in `src/views/search.html` (chats / messages / assets groups). The remaining open leg is verifying those groups against live gallery/chat/admin surfaces and their permission gating — the wiring itself is shipped.
