# TASK: NSFW override authz scope: route lacks chat-membership check; service methods unguarded

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

routes/nsfw-moderation/overrides.ts:50 override PUT gated by requireModerationAction but no chat/world membership scope: any moderator.action holder flips override on any chatId/worldId. moderation-service/index.ts:98 setChatNsfwOverride/setWorldNsfwOverride public service methods with no internal permission check (future callers bypass route guard). Decide intended scope: global moderators vs per-chat moderators; add service-level guard.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
