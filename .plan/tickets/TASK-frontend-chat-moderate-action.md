<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Chat Moderate Action

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation
**Related:** TASK-moderation-actions-frontend
**Source:** FE-BE harmonization check, 2026-09-17 — 1 route in this slice.

## Summary

Wire the chat-level "moderate" action (`POST /api/chats/:id/moderate`) for owners
or moderators. No web UI surfaces it today.

## Backend surface

| Method | Path | File |
|--------|------|------|
| POST | `/api/chats/:id/moderate` | `src/routes/chats/moderation.ts:86` |

## Acceptance Criteria

- [ ] Moderator/owner chat toolbar exposes "Moderate chat" action
- [ ] Confirmation dialog captures the moderation reason
- [ ] On success, chat is marked; UI reflects new state
- [ ] Hidden for non-moderator users
- [ ] `bun run check` green
