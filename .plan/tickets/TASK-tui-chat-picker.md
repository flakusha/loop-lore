<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI chat picker screen

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** `.plan/epics/epic-terminal-ui.md`
**Tags:** tui, chat
**Summary:** Chat-list picker screen so the TUI can start a chat at all — `ChatWidget` currently requires a pre-selected `chatId`, leaving no path into a conversation.
**Context:** `ChatWidget` (`src/tui/chat/index.ts`) requires a pre-selected `chatId`, so the TUI cannot currently start a chat — this is the single highest-value missing screen. The web counterpart is `src/routes/views/chats.ts` + `src/views/chat-list.html`. Reuse-first: the `setFetch` seam already exists in `src/tui/chat/api.ts`, and the blessed `list` pattern is already used at `src/tui/harness/index.ts:67`. No new widget library, no second screen framework.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Chat list screen added, reusing the existing `setFetch` seam in `src/tui/chat/api.ts` and the blessed `list` pattern already used at `src/tui/harness/index.ts:67`. No new widget library and no second screen framework.
- [ ] Keybindings follow the existing `src/tui/app.ts` convention.
- [ ] Selection hands the chosen `chatId` to `ChatWidget` (`src/tui/chat/index.ts`), closing the gap where no chat can be started.
- [ ] Screen is constructible under the injectable test seam from `TASK-tui-shell-testability` — no module-scope terminal construction.
- [ ] Tests cover the empty-list path and the selection path.
- [ ] Web parity reference (`src/routes/views/chats.ts`, `src/views/chat-list.html`) consulted for fields and ordering; no server route added that the TUI does not need.
- [ ] `bun run check` green.

## Related Files

- `src/tui/chat/index.ts` (`ChatWidget`), `src/tui/chat/api.ts` (`setFetch` seam), `src/tui/harness/index.ts:67` (blessed `list` pattern)
- `src/tui/app.ts` (keybinding convention)
- `src/routes/views/chats.ts`, `src/views/chat-list.html` (web counterpart)
- `TASK-tui-shell-testability`, `TASK-tui-spec-sync`

git issue: ebcb788
