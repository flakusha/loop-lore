<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Moderator frontend for per-chat tunable overrides

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

The admin System tab exposes 11 seeded keys (`registration_open`, `default_provider`, etc.) and the four open `TASK-admin-system-config-*` tickets add ~34 more. NONE of these are exposed to the per-chat settings modal moderators use to tune a single chat's behavior (temperature cap, max response tokens, NSFW threshold per chat, repetition detection, role models per chat).

Scope (frontend only — backend already supports per-chat overrides via chat settings JSON):

1. Audit existing `chat_settings` JSON shape — which keys accept admin-system-config equivalents?
2. Extend the chat settings modal (the one a moderator opens from a chat) to surface the most-leveraged subset: per-chat generation limits (max_tokens, temperature, repetition_detection), per-chat NSFW threshold, per-chat model override list. The remaining tunables stay admin-only.
3. Discoverability: a link from the admin System tab 'key rows' to the per-chat modal for keys that support per-chat override.
4. Tests: each new control persists, server returns the override on chat config read, no impact on chats that lack overrides.

Bind to `epic-frontend-admin` (shares UI surface). Coordinate with the four open TASK-admin-system-config-* tickets — once they expose the keys in admin, this ticket surfaces them per-chat.

## Acceptance Criteria

- [ ] Chat settings modal surfaces per-chat generation limits (max_tokens, temperature, repetition_detection)
- [ ] Modal surfaces per-chat NSFW threshold
- [ ] Modal surfaces per-chat model override list
- [ ] Admin System tab shows 'per-chat overridable' badge on relevant keys
- [ ] Tests: each control persists on chat save, server returns override on chat config read, chats without overrides are unaffected
- [ ] Documentation updated
