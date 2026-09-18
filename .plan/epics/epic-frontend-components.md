<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: UI Components Library

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** 🟡 In Progress
**Priority:** Medium

## Summary

Shared, server-rendered chat components (`src/components/**`). The composer
(`input-area.html`) is included by `views/chat.html` under `x-data="chatState()"`
and serves direct chat, group chat, and the mobile composer alike.
See `docs/frontend/components.md` for UX specification.

## Scope

Composer integration points (verified 2026-09):

- `input-area.html:133-146` — form + textarea (`x-ref="messageInput"`, `data-testid="message-input"`).
- `input-area.html:151-159` — send button; `:160-187` — command buttons row (`commandButtons()`).
- Alpine methods merge at `src/frontend/alpine/chat-messages.ts` (`chatSendMethods`) and
  `src/frontend/alpine/chat-actions/index.ts` (`chatActions`).
- Group specifics: `src/frontend/alpine/chat-group.ts` (mention autocomplete, `toggleGroupPause`).

## Tickets

| Ticket | Scope |
| --- | --- |
| `TASK-prompt-improve-composer-ui.md` | ✨ Improve button + level menu in `input-area.html`; Alpine `chat-actions/prompt-improve.ts` (draft replace + undo + toast) |

## Related Epics

- `docs/frontend/components.md`
- `epic-prompt-improvement.md` — unified prompt-improvement feature hosted in the composer.
