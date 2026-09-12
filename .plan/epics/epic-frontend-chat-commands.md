# EPIC: Frontend Slash Commands (`/...`) for Chat, Group Chat, Assistant

**Status:** Proposed
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
