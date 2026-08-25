# BUG: chat reunite secondary ownership check missing

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

Location: src/routes/chats/split.ts (handleReunite -> reuniteChats).

Symptom: reuniteChats ownership-checks only the PRIMARY chat (created_by === actorId). The body-supplied secondaryChatId is then merged (copyMessagesToPrimary + mergeParticipantsIntoPrimary) and archived WITHOUT any ownership/participation check. Confirmed by direct source read. Result: a chat owner can ingest another user's message content into their own chat.

Root cause: secondaryChatId is treated as trusted input; only the primary is validated.

Fix: require ownership/participation on secondaryChatId (same checkChatAccess used for primary) before merging; 404/403 on denial.

Acceptance: reunite with a non-owned secondary chat is denied; owned-secondary succeeds; regression test added.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
