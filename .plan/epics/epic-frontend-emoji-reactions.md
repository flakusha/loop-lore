<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Frontend Emoji (`:...:`) and Message Reactions

**Priority:** medium
**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Proposed
**Area:** Frontend (chat, group chat, gallery comments)

## Scope

- `:...:` shortcode parsing + render in message pipeline (shared with
  TUI preview later, not in scope here): picker UI, autocomplete in
  composer, server-rendered fallback for no-JS/htmx partials.
- In-context reactions (on visible message bubble) and out-of-context
  reactions (on reply/quote, notification jump, thread summary): single
  reaction store, optimistic Alpine update, dedup per user+emoji.
- Accessibility: keyboard-pickable emoji grid, aria labels, reduced-motion
  respected. XSS: emoji names allowlisted, never raw innerHTML.

## Tickets

- `TASK-emoji-colon-format-frontend.md`
- `TASK-message-reactions-in-out-context.md`

## Acceptance

- Typing `:fire:` renders 🔥 consistently in chat + group chat.
- React/unreact round-trips without full message re-render.
