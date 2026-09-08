# BUG: BUG: resolveActor cascade branch does not verify chat participant membership

**Status:** ✅ Done
**Priority:** low
**Effort:** Medium

## Summary

src/generation/auto-gen/resolve-actor.ts cascade branch selects the actor by id (cascadeActorId) from the actors table and returns it without checking it is a chat_participants member of chatId. Currently only reached with server-resolved ids (triggerGroupCascade uses selectNextGroupActor / validated @mentions), so it is not client-exploitable today, but it is a missing server-side assertion (defense in depth) that would become an IDOR if any caller passed a client-supplied cascadeActorId. Fix: verify the actor is a participant of chatId before returning it.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Prior claim (commit `43d0de6e`) was incorrect — re-verified 2026-09-07: the cascade branch still selected from `actors` by id with no `chat_participants` check. Actually fixed in the turn-system-extension worktree: `src/generation/auto-gen/resolve-actor.ts` cascade branch now verifies `chat_participants` membership for the target `chatId` and returns null when absent, with regression coverage in `src/generation/auto-gen/resolve-actor.test.ts` (participant resolves / non-participant null / unknown id null).
