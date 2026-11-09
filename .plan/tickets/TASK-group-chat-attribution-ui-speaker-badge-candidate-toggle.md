<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: group chat attribution UI (speaker badge + candidate toggle)

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-group-chat
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Consensus arena proposal 2; cores the frontend-viewer ticket (TASK-group-chat-frontend-viewer Not Started). Speaker badge (actor + id) on every group message; candidate toggle (pick + runners-up with model + confidence); turn-order indicator on existing endpoint; no new endpoints. Candidate/synthesis data served only after checkChatAccess for the chat; actor_id shown is display only, never accepted as auth on write; impersonated labeled with human speaker from server-resolved speaker, not client claim.

Owner: epic-group-chat.md (In Progress). Verified: only at-mention autocomplete sync (chat-participants.ts:54-57, slash-autocomplete.ts:8-10) + turn-order snapshot (participants-state.ts:50-53); speaker signal = actor_id + display name + parent_id/swipe_index lineage; epic-impersonation.md covers human-as-actor labeling.

Acceptance: every group message labeled with speaker badge; judged expandable to candidates (model+confidence when fan-out ran); impersonated turns show human speaker; frontend snapshot tests with per-test fake DOM/state, no shared participant store.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Every group message labeled with speaker badge — `src/components/chat/message-list.html:194-200`
- [x] Impersonated turns show human speaker — `src/components/chat/message-list.html:206-212` (`impersonation-badge` 🎭 via `impersonatedActorIds()` in `src/frontend/alpine/chat-participants.ts:214-217`, sourced from server `impersonate_actor_id` rows; actor_id display-only, never auth)
- [x] Turn-order indicator on existing endpoint — `src/components/chat/message-list.html:86-88` (group-turn-strip over `GET /turn-order`, outside the story tab)
- [ ] Judged expandable to candidates (model+confidence when fan-out ran) — BLOCKED on `TASK-group-cascade-n-assistant-round…` (Not Started); no candidate data exists to display
- [ ] Frontend snapshot tests with per-test fake DOM/state — open

**Status Note (T8, 2026-11-09, branch `core-t8-groupchat` commit `7f062a787`):** speaker-badge + impersonation + turn-order slices shipped (see boxes above). Candidate toggle is genuinely blocked on the fan-out judge backend, so this ticket stays In Progress with only that box (plus snapshot tests) open.
