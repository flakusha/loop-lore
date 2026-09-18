<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: update docs/spec/terminal-ui.md to match current src/tui/ file layout

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** low
**Effort:** trivial

## Summary

`docs/spec/terminal-ui.md` (lines 14-17, 22-24) references `src/tui/chat.ts` and `src/tui/input.ts`. Actual layout is the 4-file split:

- `src/tui/chat/index.ts` — ChatWidget class + blessed element refs
- `src/tui/chat/api.ts` — request dispatchers (handleSend, loadMessages) + `API_BASE`
- `src/tui/chat/display.ts` — `formatMessageLine`
- `src/tui/chat/types.ts` — `ChatMessage`, `ChatWidgetOptions`, `ChatHost`

The `input.ts` file does not exist; input handling is inlined in `ChatWidget` (`src/tui/chat/index.ts:79-95` — `blessed.textbox` + submit handler).

## Acceptance Criteria

- [ ] Spec table (lines 14-17) lists the four `src/tui/chat/` files with accurate purposes.
- [ ] Architecture section (lines 22-24) describes Chat Widget + Asset View split; drops the "Input Handler" sub-section since input is co-located with Chat Widget.
- [ ] Data flow section (line 26+) updated if necessary to reflect the dispatcher-modules pattern in `chat/api.ts` (handleSend/loadMessages threaded via `ChatHost` handle rather than `this`-bound).
- [ ] No other spec drift introduced.

## Notes

- Deferred from `tui-updates` worktree (2026-09-14 review pass): docs-only change, separated from code changes for clean PR boundary.