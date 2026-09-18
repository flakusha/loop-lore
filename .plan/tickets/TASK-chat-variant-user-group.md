<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — User Group Chat

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, user, group, social, encrypted
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 4: a classical encrypted group chat between users, with public and private subchannel flavours. Public rooms are open to anyone with the link; private rooms require invite.

## Schema Mapping

Primary tuple: `(chat_type = 'group', chat_mode = 'story', chat_purpose = 'social')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | `null` | Open-ended |
| `auto_advance` | `0` | Human turn order |
| `gm_config` | `null` | No gm; admin role enforced via `chat_participants.role` |
| `talkativity` | n/a | Default `5` |
| `prompt_override` | `null` | No LLM |

Public/private flavour is a property of the `chat_participants` visibility / join policy, not a column — handled by `epic-group-chat`.

## Creation Flow Mapping

- Entry point: Social/People tab.
- Picker: `group` + `social`; sub-pick: `public | private`.
- "Add participants" invites multiple users; creator is auto-added.
- World/location skipped.
- "Advanced" panel: encryption toggle (default ON), invite policy, optional `prompt_override` for an opt-in assistant summarizer (does not re-classify the chat).

## Acceptance Criteria

- [ ] Creating from Social/People tab with ≥2 invited users persists `chat_type = 'group'`, `chat_mode = 'story'`, `chat_purpose = 'social'`.
- [ ] Public sub-picker yields a joinable room (`epic-group-chat` join flow); private requires invite.
- [ ] Encryption is on by default; disabling it surfaces a confirmation.
- [ ] LLM auto-generation is suppressed by default; opt-in summarizer does not auto-respond in-line.
- [ ] Mention routing per `TASK-group-chat-mention-routing`.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-chat-privacy`, `epic-frontend-encryption`
- `epic-group-chat`, `TASK-group-chat-mention-routing`
- `epic-message-seen-state` — read receipts
- `FEAT-irc-integration-channels-as-group-chat-pm-as-chat` — IRC channel ↔ variant 4 mapping
- Sibling variants: `TASK-chat-variant-user-1x1`, `TASK-chat-variant-user-group-admin`
