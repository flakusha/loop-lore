<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — User 1×1 Chat

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, user, direct, encrypted
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 3: a 1×1 chat between two users, end-to-end encrypted. No LLM is invoked unless an optional assistant is added (which would re-classify the variant — see variant 9). This ticket covers the pure two-human case.

## Schema Mapping

Primary tuple: `(chat_type = 'direct', chat_mode = 'story', chat_purpose = 'social')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | `null` | Open-ended |
| `auto_advance` | `0` | Human turn order |
| `gm_config` | `null` | No gm |
| `talkativity` | n/a (no LLM) | Stored as default `5` for schema compatibility |
| `prompt_override` | `null` | No LLM |

Encryption posture: handled by `epic-chat-privacy` / `epic-frontend-encryption`. This ticket only records that variant 3 is encryption-required; column-level storage of ciphertext is the privacy epic's responsibility.

## Creation Flow Mapping

- Entry point: Social/People tab.
- Picker: `direct` + `social`.
- "Add participants" invites exactly one other user; creator is implicit.
- World/location skipped.
- "Advanced" panel surfaces encryption toggle (default ON) and blocks LLM auto-invocation.

## Acceptance Criteria

- [ ] Creating from Social/People tab with one other user persists `chat_type = 'direct'`, `chat_mode = 'story'`, `chat_purpose = 'social'`.
- [ ] `chat_participants` contains exactly two `user` rows; no `assistant` row.
- [ ] Messages are encrypted at rest using the privacy epic's key envelope.
- [ ] LLM auto-generation is suppressed by default; an explicit "summon assistant" affordance re-classifies the chat to variant 9 (or spawns a side variant).
- [ ] Lifecycle / moderation hooks still apply (block, report).

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `epic-chat-privacy`, `epic-frontend-encryption` — E2E encryption
- `TASK-chat-lifecycle-moderation` — moderation
- `FEAT-irc-integration-channels-as-group-chat-pm-as-chat` — IRC PM ↔ variant 3 mapping
- Sibling variants: `TASK-chat-variant-user-group`, `TASK-chat-variant-user-group-admin`
