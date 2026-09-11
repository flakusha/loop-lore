<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — Assistant Group Chat

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, assistant, group, multi-user
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 2: a multi-user chat that collaboratively drives one assistant for generation, prompting, planning, setup, tool calls, search, and RAG. Same shape as variant 1 but with a `group` `chat_type` so multiple contributors share the assistant's context window and tool invocations.

## Schema Mapping

Primary tuple: `(chat_type = 'group', chat_mode = 'story', chat_purpose = 'assistant')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | `null` | Conversational |
| `auto_advance` | `0` | Users drive turn order |
| `gm_config` | `null` | Single assistant; no gm arbitration |
| `talkativity` | `4` (slightly lower) | Multi-user audiences prefer tighter responses |
| `prompt_override` | optional shared override | One prompt serves all participants |

The assistant role is recorded as a single `chat_participants` row with `role = 'assistant'`; each human user has `role = 'user'`.

## Creation Flow Mapping

- Entry point: Assistant tab.
- Picker step "Who's this for?" resolves to `group` + `assistant` purpose.
- "Add participants" invites multiple users (collaborators) and exactly one assistant persona.
- World/location skipped.
- "Advanced" panel: shared `prompt_override`, `talkativity`, optional read-only mode for non-creator collaborators.

## Acceptance Criteria

- [ ] Creating from Assistant tab with ≥2 users persists `chat_type = 'group'`, `chat_mode = 'story'`, `chat_purpose = 'assistant'`.
- [ ] `chat_participants` contains one `assistant` row + N `user` rows.
- [ ] `talkativity` defaults to `4` and is shared across participants.
- [ ] Assistant role resolution (see `epic-assistant-gm-flows`) applies identically to variant 1; no per-user prompt divergence.
- [ ] Group turn routing honours `TASK-group-chat-mention-routing`; non-mentioned users can read but not steer.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `TASK-group-chat-mention-routing` — group routing semantics
- `TASK-chat-lifecycle-moderation` — lifecycle + moderation
- `epic-group-chat` — group-chat foundations
- `epic-message-seen-state` — read receipts
- Sibling variants: `TASK-chat-variant-assistant`, `TASK-chat-variant-character-group`
