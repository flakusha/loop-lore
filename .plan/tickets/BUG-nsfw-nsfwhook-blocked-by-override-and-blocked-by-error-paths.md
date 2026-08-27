# BUG: nsfw: NsfwHook blocked-by-override and blocked-by-error paths omit actorId/chatId

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/hooks/nsfw-hook.ts lines 83-106: the blocked-by-override (line 85) and blocked-by-error (line 103) returns omit actorId and chatId from the data payload, unlike every other return path. Downstream resolveActorIdFromEvents misses these events and falls back to caller-provided fallback on the two most safety-critical paths. Fix: include actorId/chatId in those payloads.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
