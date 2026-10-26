<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI slash-command completion from the live registry

**Status:** Done
**Priority:** high
**Effort:** medium
**Epic:** epic-terminal-ui
**Tags:** tui, chat, commands
**Summary:** Surface the assistant's slash-command registry in the TUI input box — completion hint, Tab cycling, Enter commit — instead of sending `/help` as ordinary prose.
**Context:** ~40 commands are dispatched during message creation (`src/routes/messages/create.ts`) and `GET /api/v1/commands` serves the live registry (`src/routes/commands/index.ts`), but the TUI showed none of it: typing `/` went out as message content with no completion and no discovery. Reuse-first: the `setFetch` seam already exists in `src/tui/chat/api.ts`, the `{ok:true,data} | {ok:false,error}` union mirrors `src/tui/chat-picker.ts`, and the hint renders as one `blessed.text` line inside the chat box the widget already owns — no palette screen, no second framework.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [x] Typing `/` in the chat input lists matches from `GET /api/v1/commands` in a one-line strip inside the existing chat box — no full-screen overlay, no second screen framework.
- [x] The registry is fetched lazily on the first `/`, exactly once, and a failed fetch degrades to plain text with no crash and no unhandled rejection.
- [x] Tab cycles the highlighted match; Enter on a highlighted match commits `/name ` to the input box instead of sending.
- [x] A bare `/` (or any command query with nothing selected) followed by Enter still sends as an ordinary message, byte-for-byte the previous behaviour.
- [x] Fetch reuses the `setFetch` seam in `src/tui/chat/api.ts`; no `mock.module` needed for the new modules.
- [x] Tests cover the prefix filter, the select/commit path, the graceful-degradation path, and the lazy one-shot fetch.
- [x] `bun run check` green for the touched files.

## Related Files

- `src/tui/chat/commands.ts` (`CommandCompleter` — filter, selection, commit, hint)
- `src/tui/chat/api.ts` (`loadCommands`, reusing the existing `setFetch` seam)
- `src/tui/chat/index.ts` (completion strip, Tab/Enter wiring)
- `src/routes/commands/index.ts` (registry route the TUI now consumes)

**Resolved:** 2026-10-16 — option (a) of the command-palette gap: strip renders above the input box inside `ChatWidget`'s own box. Tab owns completion only while matches exist, so the existing Tab focus switch is untouched when nothing is completing. Registry fetch is one-shot and settled on failure, so a 500 does not re-request on every keystroke.


git issue: 577506a
