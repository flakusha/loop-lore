<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW flag side effect runs before access check

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

src/routes/messages/create.ts:52-54 flagNsfwUserMessage executes before checkChatAccess (:59); writes moderation recordAction scoped to attacker-supplied chatId (messages/nsfw-user-flag.ts:26-71) -> audit fabrication on arbitrary chats. Fix: access check first.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
