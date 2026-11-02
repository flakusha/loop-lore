<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Keyboard Shortcuts

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-accessibility-input
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status**: In Progress
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**:
**Related**: TASK-keyboard-navigation.md

## Summary

Referenced from `TASK-keyboard-navigation.md`. See epic for details.

## Acceptance Criteria

- [x] `scroll-down`/`scroll-up` (j/k) scroll the chat message list (`#message-list`) — `src/frontend/alpine/chat-keynav.ts`
- [x] `prev-chat`/`next-chat` ([/]) switch to the neighbouring chat of the visible chat list (server-side search results while searching, otherwise `filteredChats`) through the existing `selectChat` surface — `src/frontend/alpine/chat-keynav.ts`
- [x] `goto-chatlist`/`goto-personas`/`goto-characters`/`goto-settings`/`goto-gallery` activate the sidebar controls that carry the app's own htmx navigation (`hx-get` + `hx-push-url`); `goto-home` uses `location.assign("/")`, the app root route — `src/frontend/alpine/keynav-goto.ts`
- [x] Consumers register on chat page init and are dropped on teardown (`setupKeynav`/`teardownKeynav`, `src/frontend/alpine/chat/lifecycle.ts`); the `goto-*` consumers live in the root component (`src/frontend/alpine/app.ts`) so they survive htmx swaps of `#app-root`
- [x] Consumers stay inert while the opt-in `keynav` flag is off — the shared document listener gates the dispatch (`src/frontend/alpine/shortcuts.ts`), exactly like the existing `focus-*`/`battle-slot-*` consumers
- [x] Unit tests: `src/frontend/alpine/chat-keynav.test.ts` (j/k scroll, chat switching, teardown) and `src/frontend/alpine/keynav-goto.test.ts` (goto navigation, teardown, no-consumer regression)
- [ ] World-channel chats of the sidebar tree are not walked by `[`/`]` (they are grouped per world/location)
