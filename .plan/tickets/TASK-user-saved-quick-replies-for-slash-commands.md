<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: User-saved Quick Replies for slash commands

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

One-tap buttons firing stored command strings (SillyTavern Quick Replies pattern). Builds on the command registry only; no parser change, no macros yet.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified pre-existing implementation (no new code): `users`/`chats` `quick_replies` JSON column (migration 006), CRUD in `src/chat/service/crud/update.ts`, frontend `src/frontend/alpine/chat-quick-replies.ts` + 9 green tests. Ticket closed as already satisfied.
