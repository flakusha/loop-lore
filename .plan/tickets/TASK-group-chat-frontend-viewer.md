<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Group chat frontend viewer

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-group-chat
**Caveats:** TOCTOU (turn strip reuses the `_turnOrder` snapshot loaded at chat select; a mid-view speaker change refreshes on next selectChat — no new endpoint), authorization (split/reunite owner-guard enforced server-side in `splitParty`/`reuniteChats`; header button is a client-side hint only), display-only actor_id (badge/impersonation marker never accepted as auth on write), stale state (split/reunite reload messages on success; server `bad_request` keeps the draft open).

**Summary:**

Mention UI and turn indicators for multi-character conversations (who is speaking, pass indicators); runtime pieces in src/group-chat/ are shipped, the viewer surface is not. Named in epic-group-chat Scope.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Group message list shows speaker badges — `src/components/chat/message-list.html:194-200` (`speaker-badge`, actor initial + `data-speaker`, title = display name)
- [x] Turn indicators for multi-character conversations — `src/components/chat/message-list.html:86-88` (`group-turn-strip`, current/next badges + pause toggle, reuses `_turnOrder` from `GET /turn-order`, no new request)
- [x] Pass/pause indicators — strip pause button + existing header `toggle-group-pause` (`src/components/chat/chat-header.html`)
- [x] Tests passing — `src/frontend/alpine/chat-party-split.test.ts` (9 tests), group/branch suites green; `tsc --noEmit` clean, eslint clean

**Status Note (T8, 2026-11-09, branch `core-t8-groupchat` commit `7f062a787`):** viewer surface shipped: turn strip + speaker badge + impersonation marker (`message-list.html:86-88,194-212`; `impersonatedActorIds()` in `src/frontend/alpine/chat-participants.ts:214-217`) and split/reunite execution modal (`src/components/chat/party-split-panel.html`, `src/frontend/alpine/chat-party-split.ts:32` `chatPartySplit`, header entry `chat-header.html:316-318`, mounted `src/views/chat.html:68`). Remainder: candidate toggle needs the fan-out judge backend (`TASK-group-cascade-n-assistant-round…`, Not Started); `max_turns` is create-time only (no PATCH route) so no depth knob.
