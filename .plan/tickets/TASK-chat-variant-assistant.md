<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — Assistant Chat

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Low
**Type:** Feature Ticket
**Tags:** chat, variant, assistant, direct
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 1 of the chat taxonomy: a one-user / one-assistant chat used for generation, prompting, planning, setup, tool calls, search, and RAG. Surface area is the existing Assistant tab. This ticket declares the `(chat_type, chat_mode, chat_purpose)` tuple, the auxiliary columns, and how creation flows from the Assistant tab.

## Schema Mapping

Primary tuple: `(chat_type = 'direct', chat_mode = 'story', chat_purpose = 'assistant')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | `null` | Conversational; no hard turn cap |
| `auto_advance` | `0` | User drives turn order |
| `gm_config` | `null` | Single assistant; no gm |
| `talkativity` | `5` (default) | Standard response density |
| `prompt_override` | optional (assistant persona / tool roster) | Lets the assistant role inject its own system instructions |

## Creation Flow Mapping

- Entry point: Assistant tab (`/` → `assistant`).
- Picker step "Who's this for?" resolves to `direct` + `assistant` purpose.
- "Add participants" invites exactly one assistant persona (from the configured assistant catalog); the user is implicit (creator).
- "Start in a world/location" is **not** offered; this variant is world-agnostic.
- "Advanced" panel exposes `prompt_override` (assistant persona prompt) and `talkativity`.

## Acceptance Criteria

- [ ] Creating a chat from the Assistant tab persists `chat_type = 'direct'`, `chat_mode = 'story'`, `chat_purpose = 'assistant'`.
- [ ] `talkativity` defaults to `5` and is editable in the advanced panel.
- [ ] `prompt_override` accepts an optional system prompt override; when set, it is appended to the assistant's role-resolved prompt.
- [ ] The chat participates in normal context-window + lifecycle behaviour (see `epic-chat-lifecycle-moderation`).
- [ ] The chat does not require world/location fields; the creation modal omits those steps.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `TASK-chat-lifecycle-moderation` — context + transitions
- `FEAT-chat-template-config-lifecycle` — `chat_setup_templates` row may seed default `prompt_override`
- `epic-assistant-gm-flows` — assistant role resolution
- Sibling variants: `TASK-chat-variant-assistant-group` (group), `TASK-chat-variant-llm-only` (no user)

## Open Questions

- Should `prompt_override` here allow referencing assistant-scoped tool rosters explicitly, or inherit from the assistant role? Today it inherits; explicit override deferred.
