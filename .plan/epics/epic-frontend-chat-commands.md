<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Frontend Slash Commands (`/...`) for Chat, Group Chat, Assistant

**Priority:** medium
**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Area:** Frontend composer + assistant continuation flows

## Scope

- Unified `/...` command registry for direct chat, group chat, and
  assistant sessions: discovery list, prefix matching, arg hints,
  permission gating (user/mod/admin/GM).
- Assistant work continuation: `/continue`, `/branch`, `/retry`-style
  flows resume prior assistant state instead of starting fresh; chat and
  group variants share the registry with different capability sets.
- Composer UX: `/` autocomplete popup (keyboard navigable), inline help,
  unknown-command toast with did-you-mean. No backend command execution
  changes — frontend dispatch only.

## Tickets

- `TASK-slash-commands-chat-group-assistant.md`
- `TASK-chat-composer-markdown-pre-render-preview-before-send.md` - open (pre-send markdown preview)
- `TASK-chat-composer-tab-complete-for-commands-mentions-emoji.md` - open (unified Tab-accept)

## Acceptance

- Same registry drives all three composers; disallowed commands hidden
  with explanation, not silent failure.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Emoji Reactions | `:name:` autocomplete registry | Shared composer popup (see `matrix-frontend-backend-integration.md` FB2) |
| Frontend Components | Composer markup | `src/components/chat/input-area.html` |
| Assistant / GM flows | Continuation commands | `/continue`, `/branch` |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Emoji Reactions | Shared trigger registry | One autocomplete popup |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Command registry (`src/frontend/alpine/chat-actions/command-palette.ts`) | Emoji Reactions, group chat | Permission-gated command dispatch |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Frontend dispatch only; no backend command execution |

