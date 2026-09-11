<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — Chat (with Character)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, character, roleplay, direct
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 9: a 1×1 chat between one user and one LLM character. The canonical RP chat. Created from the Characters tab; invite exactly one character.

## Schema Mapping

Primary tuple: `(chat_type = 'direct', chat_mode = 'story', chat_purpose = 'roleplay')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | `null` | Conversational |
| `auto_advance` | `0` | User drives turns |
| `gm_config` | `null` | Single character; no gm |
| `talkativity` | `7` | RP favours immersive output |
| `prompt_override` | optional character persona override | Allows ad-hoc persona tweaks without touching the character record |

`chat_participants` contains one `user` row + one `assistant` row whose `character_id` points at the invited character.

## Creation Flow Mapping

- Entry point: Characters tab.
- Picker: `direct` + `roleplay`.
- "Add participants" invites exactly one character (multi-character invitation here is an error — see variant 10).
- "Start in a world/location" is **optional** — the chat can start in a no-world state (e.g. an introductory scene). Selecting a world drops the chat into a world-scoped session.
- "Advanced" panel: `talkativity`, optional `prompt_override`, optional NSFW toggle.

## Acceptance Criteria

- [ ] Creation from Characters tab with one character persists `chat_type = 'direct'`, `chat_mode = 'story'`, `chat_purpose = 'roleplay'`.
- [ ] `chat_participants` includes one `assistant` row with `character_id` set.
- [ ] Character memory + traits are injected per `epic-character-core-system`.
- [ ] Optional world/location start binds the chat to that world; chat transitions use `TASK-chat-transfer-location`.
- [ ] Lifecycle + context window apply per `TASK-chat-lifecycle-moderation`.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-character-core-system` — character data
- `epic-visual-novel-mode` — VN rendering for variant 9 (cross-cut)
- `TASK-chat-sectioning-multi-location` — sectioning per location
- `TASK-chat-transfer-location` — location transitions
- Sibling variants: `TASK-chat-variant-character-group`, `TASK-chat-variant-rpg`
