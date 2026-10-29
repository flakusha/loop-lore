<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: group chat attribution UI (speaker badge + candidate toggle)

**Status:** Not Started
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

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
