<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Assistant slash-command typed-token autocomplete

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Mirror `@`-mention autocomplete (`src/frontend/alpine/chat-group.ts:79-110`) for `/`-prefixed slash commands in the composer; surface candidates from `registry.listCommands()` with Tab/Enter/Esc/keyboard navigation + a11y.
**Epic:** epic-assistant-generation-extensions
**Tags:** autocomplete, frontend, assistant, slash-command

## Summary

Add composer-side typed-token autocomplete for `/`-prefixed assistant slash commands, mirroring the existing `@`-mention autocomplete pattern at `src/frontend/alpine/chat-group.ts:79-110`.

**Context:** EPIC-2026-23 roadmap item "autocomplete" is not implemented for slash commands. Today `/`-commands are surfaced only via static UI buttons (`data-testid="btn-improve"`, `btn-roll`) per `epic-assistant-generation-extensions.md:436-438`. The Alpine composer at `src/frontend/alpine/chat-send.ts` / `input-area.html` has no `/`-token completion equivalent.

**Scope:**
- Detect `/`-prefix token in the composer textarea (current line, cursor position).
- Query candidate list from `registry.listCommands()` (`src/assistant/commands/registry.ts:137-141`) — names + brief description from each command file.
- Render a popover/grid near the caret (reuse the existing mention-popover layout at `chat-group.ts`).
- Tab/Enter accepts; Escape closes; Up/Down navigates.
- Hide for short tokens (`< 1 char after `/`).
- Wire accessibility: `role="listbox"`, `aria-activedescendant`, keyboard arrow keys (per `epic-accessibility-input.md`).

**Tests:** add `src/frontend/alpine/slash-autocomplete.test.ts` mirroring `chat-group.test.ts:104-106` (Tab accepts active candidate) — pure unit tests on the token-parser + candidate-filter.

**Acceptance Criteria:**
- Typing `/im` in the composer surfaces `/improve`, `/impersonate`, `/image` (filtered, ordered).
- Tab/Enter inserts the command name + trailing space.
- Escape closes the popover.
- Tests pass; existing `chat-group.test.ts` + composer tests remain green.
- Coverage floor 80% per module.

**Related:**
- EPIC-2026-23 (Assistant Commands)
- `src/frontend/alpine/chat-group.ts:79-110` (`@`-mention autocomplete to mirror)
- `src/assistant/commands/registry.ts:137-141` (`listCommands`)
- `src/components/chat/input-area.html`
- `epic-assistant-generation-extensions.md:436-438` (UI-button mockup)
- `epic-accessibility-input.md` (a11y patterns)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
