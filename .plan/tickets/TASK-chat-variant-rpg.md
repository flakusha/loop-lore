<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — RPG Chat

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, rpg, world, location, rules
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 11: a one-user RPG session attached to a world and a location, with additional rules enforced. The user is the player; an LLM (or hybrid) is the gm. Created from the Characters tab with world/location required.

**"Invite event" semantics:** when the user creates an RPG chat from the Characters tab, the chat-creation flow MUST trigger an `invite` event on the world (per `epic-rpg-core-wiring`). The gm runs a small intro story to introduce the character to the world, then transitions into the chat proper. This is the only variant where creation has a mandatory narrative prelude.

## Schema Mapping

Primary tuple: `(chat_type = 'direct', chat_mode = 'story', chat_purpose = 'rpg')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | `null` | Open-ended session |
| `auto_advance` | `0` | Player drives turns |
| `gm_config` | `{ gm_profile: { kind: 'llm' \| 'user' \| 'hybrid', persona_ref, autonomy_level } }` | Gm identity (llm/user/both per chat setup) |
| `talkativity` | `6` | Story pacing |
| `prompt_override` | optional house-rules override | Per-chat house rules without touching world record |

World + location binding is via existing `chats.world_id` / `chats.location_id` (see `epic-world-chat-channels-invites`).

## Creation Flow Mapping

- Entry point: Characters tab.
- Picker: `direct` + `rpg`.
- "Add participants" invites exactly one character (player) and one gm persona.
- **"Start in a world/location" is required** — picker surfaces worlds the user has access to and a location within the chosen world.
- "Invite event" fires automatically post-create: gm runs an intro scene introducing the character to the world; once the gm signals ready, the chat transitions into its first in-world exchange.
- "Advanced" panel: house-rules `prompt_override`, gm autonomy level.

## Acceptance Criteria

- [ ] Creation from Characters tab with one character + gm + world + location persists `chat_type = 'direct'`, `chat_mode = 'story'`, `chat_purpose = 'rpg'` and binds `world_id` + `location_id`.
- [ ] Post-create invite event triggers an intro story before the first player turn.
- [ ] `chat_participants` has the player (user) + character (assistant) + gm (gm_profile.kind); gm role is `gm`, not `assistant`.
- [ ] House-rules `prompt_override` is applied at prompt assembly.
- [ ] Location transfers use `TASK-chat-transfer-location`; sectioning per location per `TASK-chat-sectioning-multi-location`.
- [ ] OOC questions route per `TASK-rpg-chat-questions`.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-world-chat-channels-invites` — world/location binding + invite event
- `epic-rpg-core-wiring`, `epic-rpg-wiring-phase3`, `epic-rpg-mechanics` — RPG mechanics + intro event
- `TASK-chat-sectioning-multi-location`, `TASK-chat-transfer-location`
- `TASK-rpg-chat-questions` — OOC handling
- `TASK-rpg-history-committing-chats-per-world` — per-world history commit
- Sibling variants: `TASK-chat-variant-character`, `TASK-chat-variant-rpg-group`
