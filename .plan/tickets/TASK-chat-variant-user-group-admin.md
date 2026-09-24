<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Variant — User Group Chat with Admin / Moderator

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** High
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, variant, user, group, admin, moderator, social
**Epic:** epic-chat-variants-taxonomy

## Summary

Variant 5: a public social group chat with admin/moderator scope. Differs from variant 4 by the presence of admin/moderator participants whose role extends beyond normal user scope (kick, ban, pin, lock, slow-mode).

**Authority for "chat admin":** any of (a) global admin user, (b) chat creator, (c) assigned/owning admin/moderator participant. Resolution happens at the moderation hooks (see `TASK-chat-lifecycle-moderation`) and uses existing `chat_participants.role` plus the creator id.

## Schema Mapping

Primary tuple: `(chat_type = 'group', chat_mode = 'story', chat_purpose = 'social')`.

Auxiliary columns on `chats`:

| Column | Value | Reason |
|---|---|---|
| `max_turns` | `null` | Open-ended |
| `auto_advance` | `0` | Human turn order |
| `gm_config` | populated `{ moderation: { slow_mode_ms?, pinned?, lock? } }` | Holds admin-scope settings; the gm_config JSON is repurposed for this (see Open Questions) |
| `talkativity` | n/a | Default `5` |
| `prompt_override` | `null` | No LLM by default |

Admin/moderator identity itself is `chat_participants.role IN ('admin', 'moderator')` — no new column.

## Creation Flow Mapping

- Entry point: Social/People tab.
- Picker: `group` + `social` + `with-admin`.
- "Add participants" invites multiple users + at least one admin (creator becomes admin by default; second admin can be promoted post-creation).
- World/location skipped.
- "Advanced" panel: admin scope (kick/ban/pin/lock/slow-mode).

## Acceptance Criteria

- [ ] Creating from Social/People tab with admin scope persists `chat_type = 'group'`, `chat_mode = 'story'`, `chat_purpose = 'social'` and seeds `gm_config.moderation`.
- [ ] `chat_participants` includes at least one row with `role = 'admin'`; creator is admin by default.
- [ ] Admin actions (kick, ban, pin, lock, slow-mode) are restricted to admin role.
- [ ] Public visibility by default; private is opt-in.
- [ ] Encryption posture matches variant 4 unless disabled.

## Related Epics / Tickets

- Parent: `epic-chat-variants-taxonomy`
- `TASK-chat-lifecycle-moderation` — moderation actions + audit
- `TASK-user-block-ban-shadow` (under `epic-chat-lifecycle-moderation`) — ban/kick semantics
- `epic-group-chat`
- Sibling variants: `TASK-chat-variant-user-group`

## Open Questions

- `gm_config` is currently used by rpg/gm flows (see `enums-core/chat.ts:23` "Per-mode rendering override stored inside gm_config"). Repurposing it as a moderation-scope bucket may collide with those flows. A dedicated `moderation_config` JSON column would be cleaner but is out of scope for this taxonomy-only epic; deferred to `epic-chat-lifecycle-moderation`.
