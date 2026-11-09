<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Group chat frontend viewer

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-group-chat

**Summary:**

Mention UI and turn indicators for multi-character conversations (who is speaking, pass indicators); runtime pieces in src/group-chat/ are shipped, the viewer surface is not. Named in epic-group-chat Scope.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete — group-chat viewer: speaker badge + impersonation marker + turn-indicator strip in `src/components/chat/message-list.html` (strip ~:43-76, badge ~:172-197 in worktree); cascade fan-out controls for split/reunite in `src/components/chat/party-split-panel.html` + `src/frontend/alpine/chat-party-split.ts` + header entry `chat-header.html` party-split-toggle
- [x] Tests passing — `chat-party-split.test.ts` (9 tests), `chat-group/branches/branch-merge` suites green; `tsc --noEmit` clean, eslint clean
- [x] Documentation updated — this ticket (see Status Note)

**Status Note (T8, 2026-11-09, branch `core-t8-groupchat`):** mention autocomplete + turn-order indicator backend were already shipped (`chat-participants.ts`, `GET /turn-order`); this slice adds the missing viewer surface: per-message speaker badge (actor initial, `data-speaker`), human-played 🎭 marker via `impersonatedActorIds()`, group turn strip (current/next + pause toggle reusing `_turnOrder`), and split/reunite execution modal (`POST /split`, `POST /reunite`, server `bad_request` shown inline, draft preserved). Remainder: candidate toggle needs the fan-out judge backend (`TASK-group-cascade-n-assistant-round…`, still Not Started); cascade depth knob (`max_turns`) is create-time only — no PATCH endpoint exists.

**Resolved:** 2026-11-09 registry-driven close: git issue 8e3fdc1 (registry tip: 32de4b7dc Konstantin Fedotov Auto-closed: appended .md marker marks TASK-GROUP-CHAT-FRONTEND-VIEWER )
