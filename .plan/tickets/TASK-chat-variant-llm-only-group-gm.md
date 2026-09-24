<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — LLM-Only Group Chat with Admin / GM

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, llm, gm, guided-story
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 8: an LLM-driven guided story where one persona is the gm and the rest are actors (also LLMs). The gm may itself be an LLM, a user, or both — this is decided at creation time and persisted via `gm_config.gm_profile`.

## Schema Mapping

Primary tuple: `(chat_type = 'group', chat_mode = 'story', chat_purpose = 'guided')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | optional (per gm direction) | Gm can request explicit cap or none |
| `auto_advance` | `0` (gm-driven) | Gm decides next speaker |
| `gm_config` | `{ gm_profile: { kind: 'llm' \| 'user' \| 'hybrid', persona_ref, autonomy_level } }` | Captures gm identity + control surface |
| `talkativity` | `6` | Story pacing |
| `prompt_override` | optional gm persona override | Allows injecting gm-specific prompt |

`chat_participants` contains one `gm`-tagged row (kind per `gm_config.gm_profile.kind`) and N `assistant` actor rows.

## Creation Flow Mapping

- Entry point: internal Sandbox tab (or product-side "Guided Story" surface, when one exists).
- Picker: `group` + `guided`.
- "Pick a gm": Llm / user / hybrid picker. Hybrid = user steers but LLM fills in scene narration.
- "Add participants" picks N actor personas.
- World/location: optional ("story arena" — a soft location, no world binding required).
- "Advanced" panel: `gm_profile.autonomy_level`, optional `prompt_override`.

## Acceptance Criteria

- [ ] Creation persists `chat_type = 'group'`, `chat_mode = 'story'`, `chat_purpose = 'guided'`.
- [ ] `gm_config.gm_profile` records `kind ∈ {llm, user, hybrid}` plus persona ref.
- [ ] Gm arbitration picks the next speaker (overrides battle-mode turn order).
- [ ] Hybrid gm surfaces narration steering affordances to the user.
- [ ] Narration routing per `epic-narration-actor-separation` distinguishes gm narration from actor dialogue.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-assistant-gm-flows` — gm role resolution
- `epic-narration-actor-separation` — narration routing
- Sibling variants: `TASK-chat-variant-llm-only-group`, `TASK-chat-variant-character-group`, `TASK-chat-variant-rpg-group`
