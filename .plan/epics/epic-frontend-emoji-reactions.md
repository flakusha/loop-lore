<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Frontend Emoji (`:...:`) and Message Reactions

**Priority:** medium
**Effort:** Medium
**Type:** epic
**Tags:** frontend, chat, group-chat, emoji, reactions, a11y
**Overview:** Chat and group-chat emoji: `:shortcode:` rendering in the shared message pipeline plus in-bubble message reactions. Reactions API + optimistic toggle shipped; picker hydrates from the server allowlist. Remaining: composer autocomplete, server-rendered fallback, out-of-context affordances, picker a11y.


**Status:** In Progress

**Status Note:** Shipped: reactions API (`src/routes/message-reactions.ts` via `src/routes/v1/chats-surface.ts`, prefix `/api/v1`), optimistic `toggleReaction` with rollback + toast (`src/frontend/alpine/chat-messages.ts`), allowlisted `:shortcode:` render in the shared pipeline (`src/frontend/alpine/chat-utils/emoji.ts` → `renderMarkdown`), picker hydrated from `GET quick-emojis`, reaction chips + picker popover (`src/components/chat/message-list.html`). Open: composer `:` autocomplete, server-rendered fallback for no-JS/htmx partials, out-of-context affordances (quotes/replies/notification jumps), picker keyboard/a11y.
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

| Ticket | Status | Scope |
| --- | --- | --- |
| `TASK-emoji-colon-format-frontend.md` | Partially done | Allowlisted render shipped (shared pipeline); left: composer autocomplete, server fallback, gallery parity |
| `TASK-message-reactions-in-out-context.md` | Partially done | In-context chips + picker shipped; left: out-of-context affordances on quotes/replies/notification jumps |
| `TASK-chat-composer-tab-complete-for-commands-mentions-emoji.md` (epic-frontend-chat-commands) | Done | Tab-accept affordance the `:` autocomplete must reuse |
| picker keyboard/a11y (no ticket yet) | Not Started | Picker popover is mouse-only: focus trap, arrow-key nav, `role=grid`, aria labels, reduced-motion |
| server-rendered shortcode fallback (no ticket yet) | Not Started | htmx/no-JS partials bypass `renderMarkdown`; needs server-side shortcode substitution or pre-rendered HTML |
| picker deduplication (no ticket yet) | Not Started | `_quickEmojis` hardcoded in `inline-state.ts` + `lifecycle.ts`; hydrate-only already lands from `quick-emojis` |

## Acceptance

- Typing `:fire:` renders 🔥 consistently in chat + group chat (shared `renderMarkdown` path covers both; gallery/blog comments ride the same helper).
- Unknown `:nope:` stays literal; `:fire:` inside backticks stays literal; no console errors.
- React/unreact updates the chip instantly, converges to the server count on success, rolls back + toasts (`chats.reactionFailed`) on failure — no full message re-render.
- Picker row matches the server allowlist (`GET /api/v1/messages/quick-emojis`) after load; hardcoded defaults render first.
- Out-of-context react (quote/reply/notification jump) converges to the same count as the in-bubble chip (open — see ticket).
- Picker is keyboard-operable with aria labels and honors reduced-motion (open — no ticket yet).

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Chat Commands (`epic-frontend-chat-commands.md`) | Shared `:` trigger registry + Tab-accept | `:` autocomplete in the composer reuses the palette popup (`TASK-chat-composer-tab-complete-for-commands-mentions-emoji.md`, Done) |
| Frontend Components (`epic-frontend-components.md`) | Composer + message bubbles | `src/components/chat/input-area.html` (composer), `src/components/chat/message-list.html` (chips + picker popover) |
| Group Chat (`epic-group-chat.md`) | Group message surface | Same `message-list.html` + `renderMarkdown` path; no group-specific reaction code |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Chat Commands | Shared autocomplete popup | Tab-accept parity between `/` commands, `@` mentions, `:` emoji |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Reaction state (`toggleReaction`/`loadMessageReactions`, `src/frontend/alpine/chat-messages.ts`) | Chat/group views | Optimistic react/unreact with rollback, per-user dedup via grouped `userReacted` |
| Picker allowlist (`GET /api/v1/messages/quick-emojis` → `_quickEmojis`) | Chat/group views | Server-owned emoji set; client hydrates, hardcoded defaults render first |
| Shortcode map (`EMOJI_SHORTCODES`, `src/frontend/alpine/chat-utils/emoji.ts`) | Chat/group/blog render | Allowlisted `:name:` → emoji, unknown stays literal, backtick spans exempt |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| Reaction round-trip | emits | Message reactions API |

