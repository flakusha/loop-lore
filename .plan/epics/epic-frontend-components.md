<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: UI Components Library

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** In Progress
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

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Chat Commands | Composer command registry | `/` autocomplete hosted in the composer |
| Emoji Reactions | `:name:` emoji autocomplete | Shared composer popup |
| Frontend Gallery | Gallery modals | `src/partials/gallery/*` |
| Notifications UI | Toast/overlay consumers | `src/components/overlay-stack.html` |
| HTML Dedup & HTMX Reuse | Extracted shared partials | Land in `src/components/` |
| Internationalization | Translated strings | Post-swap hydration |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Routing, Gallery, Notifications, Chat Commands, Emoji Reactions | Shared components | Composer, modals, toasts, badges |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| htmx swap lifecycle (`src/frontend/alpine/htmx.ts`) | HTML Dedup, I18N | `AfterSwap → Alpine.initTree()` + OOB |
| Composer markup (`src/components/chat/input-area.html`) | Chat Commands, Emoji Reactions | One composer, multiple trigger registries |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| htmx `afterSwap` | subscribes | Re-init Alpine on swapped partials |

