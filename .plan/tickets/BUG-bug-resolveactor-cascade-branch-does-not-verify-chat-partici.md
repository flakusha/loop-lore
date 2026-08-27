# BUG: BUG: resolveActor cascade branch does not verify chat participant membership

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/generation/auto-gen/resolve-actor.ts cascade branch selects the actor by id (cascadeActorId) from the actors table and returns it without checking it is a chat_participants member of chatId. Currently only reached with server-resolved ids (triggerGroupCascade uses selectNextGroupActor / validated @mentions), so it is not client-exploitable today, but it is a missing server-side assertion (defense in depth) that would become an IDOR if any caller passed a client-supplied cascadeActorId. Fix: verify the actor is a participant of chatId before returning it.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
