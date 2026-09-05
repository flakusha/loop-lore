# BUG: NSFW flag side effect runs before access check

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** medium
**Effort:** Small

## Summary

src/routes/messages/create.ts:52-54 flagNsfwUserMessage executes before checkChatAccess (:59); writes moderation recordAction scoped to attacker-supplied chatId (messages/nsfw-user-flag.ts:26-71) -> audit fabrication on arbitrary chats. Fix: access check first.

## Resolution

Fixed in `src/routes/messages/create.ts`: `checkChatAccess` now runs immediately after `requireUserId` and params extraction, BEFORE `flagNsfwUserMessage` — a non-participant gets 404 with zero NSFW-flag side effects. The duplicate later `access` const was removed.

Tests: `src/routes/messages/__tests__/nsfw-flag-before-access.test.ts` — non-participant POST → 404 and `flagNsfwUserMessage` mock never called; participant POST → flag called (sentinel 500 proves the ordering contract).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated