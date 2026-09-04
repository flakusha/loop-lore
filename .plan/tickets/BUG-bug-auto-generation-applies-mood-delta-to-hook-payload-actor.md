# BUG: BUG: auto-generation applies mood delta to hook-payload actorId, not the generating character

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/auto-generation.ts calls applyPostStoreEffects with actorId: hooks.actorId ?? characterId. hooks.actorId is resolved from hook event payloads via resolveActorIdFromEvents (src/generation/auto-gen/resolve-actor-from-events.ts), which trusts the first non-empty data.actorId with no validation. MoodService.applyHappinessDelta then writes the happiness delta to that (possibly foreign or wrong) actor instead of the server-resolved generating character (characterId). Fix: pass characterId (server-resolved) for the mood write, or validate that hooks.actorId matches characterId before using it.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated

## Resolution

Added an explicit `characterId` parameter to `PostStoreOpts` (src/generation/auto-gen/post-store.ts). The mood-write call inside `applyPostStoreEffects` now uses `characterId` (server-resolved by `resolveActor` in auto-generation.ts) instead of `actorId` (which for group chats may be a hook-resolved mention target). `actorId` keeps its existing role as the message-storage identity. The orchestrator passes `characterId: characterId` alongside `actorId: hooks.actorId ?? characterId`. Test fixtures at src/generation/auto-gen/post-store.test.ts updated to pass `characterId` (both tests still pass; the catch-path contract test in auto-generation.test.ts was not affected by the call signature since it triggers errors before the call site). `bun run tsc --noEmit` clean; `bun test src/generation/auto-gen/post-store.test.ts src/generation/auto-gen/auto-generation.test.ts` 5/5 pass.
