<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — Group Chat (Multi-Character)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, character, group, roleplay, admin, gm
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 10: multiple users + multiple characters in one chat, with admin/gm functionality implied. Created from the Characters tab by inviting multiple characters and at least one other user (or going solo with multi-character "narrator" cast).

## Schema Mapping

Primary tuple: `(chat_type = 'group', chat_mode = 'story', chat_purpose = 'roleplay')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | `null` | Conversational |
| `auto_advance` | `0` | Users drive turns |
| `gm_config` | `{ cast: [character_id, ...], director?: character_id }` | Records the invited cast + optional director character |
| `talkativity` | `6` | Multi-character scenes balance verbosity |
| `prompt_override` | optional per-character override map | Allows fine-tuning one character without touching its record |

`chat_participants` includes N `user` rows + N `assistant` rows whose `character_id`s come from `gm_config.cast`. Admin/gm authority per "chat admin" definition (global admin OR creator OR owning gm).

## Creation Flow Mapping

- Entry point: Characters tab.
- Picker: `group` + `roleplay`.
- "Add participants" invites **multiple characters** (required) and optionally invites additional users (solo-with-cast allowed).
- "Start in a world/location" is optional.
- "Advanced" panel: per-character prompt overrides, optional director character, admin/gm scope.

## Acceptance Criteria

- [ ] Creation from Characters tab with ≥2 characters persists `chat_type = 'group'`, `chat_mode = 'story'`, `chat_purpose = 'roleplay'`.
- [ ] `gm_config.cast` lists invited character ids.
- [ ] `chat_participants` has one row per invited character and per invited user.
- [ ] Group routing uses `TASK-group-chat-mention-routing`.
- [ ] Director character (if set) has narration-only privileges per `epic-narration-actor-separation`.
- [ ] Admin/gm scope applies per "chat admin" authority rule.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-group-chat`, `TASK-group-chat-mention-routing`
- `epic-narration-actor-separation`
- `epic-visual-novel-mode` — VN rendering
- Sibling variants: `TASK-chat-variant-character`, `TASK-chat-variant-llm-only-group-gm`
