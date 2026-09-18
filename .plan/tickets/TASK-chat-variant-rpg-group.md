<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — RPG Group Chat

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Ticket
**Tags:** chat, variant, rpg, group, world, party, turn-rules
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 12: a multi-user party RPG session attached to a world and a location, with enforced turn rules. Multiple players + one or more characters + a gm (Llm / user / both) participate. The party must coexist within the turn-arbitration layer.

## Schema Mapping

Primary tuple: `(chat_type = 'group', chat_mode = 'battle', chat_purpose = 'rpg')`.

> chat_mode is `battle` because RPG group turn arbitration reuses existing battle-mode turn machinery. If `epic-rpg-wiring-phase3` introduces a dedicated `rpg` ChatMode, flip this to that. See Open Questions in the parent epic.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | optional (turn cap per round) | Round-level cap when configured |
| `auto_advance` | `1` | Turn-driven; battle-mode arbitration |
| `gm_config` | `{ gm_profile, rpg_party: [character_id, ...], party_size }` | Gm + party roster |
| `talkativity` | `5` | Multi-party scenes tighten to fit the turn cadence |
| `prompt_override` | optional house-rules override | Per-chat house rules |

World + location binding via `chats.world_id` / `chats.location_id`.

`chat_participants` contains N `user` rows (players), N `assistant` rows (characters), and one `gm` row (gm_profile.kind resolves llm/user/hybrid).

## Creation Flow Mapping

- Entry point: Characters tab.
- Picker: `group` + `rpg`.
- "Add participants" invites **multiple characters** (party) + optionally multiple additional players. The creator becomes the first player.
- **"Start in a world/location" is required** — same world/location picker as variant 11.
- **"Invite event"** fires for each party member: each invited character gets a small intro story introducing them to the world.
- "Pick a gm": Llm / user / hybrid.
- "Advanced" panel: round cap (`max_turns`), party roster, gm autonomy, house-rules `prompt_override`.

## Acceptance Criteria

- [ ] Creation persists `chat_type = 'group'`, `chat_mode = 'battle'`, `chat_purpose = 'rpg'` and binds `world_id` + `location_id`.
- [ ] `gm_config.rpg_party` lists party character ids; `chat_participants` reflects the full roster.
- [ ] Invite event fires once per party member, producing N intro scenes that transition into the chat.
- [ ] Turn arbitration uses battle-mode machinery (`epic-battle-action-systems`); per-round cap honored when set.
- [ ] Group routing per `TASK-group-chat-mention-routing` overlays on top of turn arbitration.
- [ ] OOC questions route per `TASK-rpg-chat-questions`; per-world history commits per `TASK-rpg-history-committing-chats-per-world`.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-world-chat-channels-invites` — world binding + invite event
- `epic-rpg-core-wiring`, `epic-rpg-wiring-phase3`, `epic-rpg-mechanics`
- `epic-battle-action-systems` — turn arbitration re-used
- `TASK-group-chat-mention-routing`
- `TASK-chat-sectioning-multi-location`, `TASK-chat-transfer-location`
- `TASK-rpg-chat-questions`, `TASK-rpg-history-committing-chats-per-world`
- `TASK-chat-branch-merge` — branch + merge for narrative forks
- `epic-message-seen-state`, `epic-actor-turn-skip`
- Sibling variants: `TASK-chat-variant-rpg`, `TASK-chat-variant-character-group`, `TASK-chat-variant-llm-only-group-gm`

## Open Questions

- Whether `chat_mode = battle` should be replaced by a future `chat_mode = rpg` once `epic-rpg-wiring-phase3` lands. Decision is deferred per the parent epic's Open Questions §1.
