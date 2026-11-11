<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web UI buttons for party split/reunite (parity with /split /reunite commands)

**Status:** Done
**Status Note:** 2026-11-10 (release-010-closeout): the web UI ships — `chatPartySplit` (`src/frontend/alpine/chat-party-split.ts`) backs the `party-split-panel.html` modal against `POST /api/v1/chats/:id/split` and `POST /api/v1/chats/:id/reunite`: branch drafts (a location plus an actor set per branch), a reunite picker over the chat's child branches, a toast on success, the server's refusal message on error, and a transcript refresh after a successful split or reunite. Tests: `src/frontend/alpine/chat-party-split.test.ts`.
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add frontend buttons in the web chat UI so Split and Reunite are reachable without typing slash commands, exactly mirroring the /split and /reunite chat commands (src/assistant/commands/split.ts, src/assistant/commands/reunite.ts, branch-spec validation in src/chat/service/split-validate.ts) and the REST endpoints POST /api/v1/chats/:id/split and POST /api/v1/chats/:id/reunite (src/routes/chats/split.ts) added in commit 165983c0d (branch c7-branch-exec).

Split: a Split button in the chat UI (near the composer or in the party/branches context, e.g. alongside the branches entry points in src/components/chat/chat-header.html) opens a small form collecting at least 2 branch groups. Each group is a location picker limited to the chat's world locations plus an actor multi-select limited to the chat's participants — the same constraints validateBranchSpecs enforces server-side (src/chat/service/split-validate.ts). Submit POSTs /api/v1/chats/:id/split.

Reunite: a Reunite button opens a picker of the chat's child branches (parent_chat_id = current chat, i.e. the reuniteable secondaries), then POSTs /api/v1/chats/:id/reunite.

Success/error surfaced via toast plus transcript refresh — exactly what the commands' systemMessages convey today.

Precedent pattern to follow: the branch-merge wizard modal src/components/chat/branch-merge-modal.html (window.apiFetch POST to /api/v1/chats/:id/branch-merges, modal steps, toasts) and the branch panel src/components/chat/branch-list-panel.html mounted from src/components/chat/chat-header.html. Related: epic-chat-transfer-location, TASK-chat-branch-merge.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-11-11 registry-driven close: git issue 4e332d2 (registry tip: 3147154c6 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-WEB-UI-BUTTONS-FOR-PARTY-SP)
