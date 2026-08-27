# BUG: BUG: auto-generation applies mood delta to hook-payload actorId, not the generating character

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/auto-generation.ts calls applyPostStoreEffects with actorId: hooks.actorId ?? characterId. hooks.actorId is resolved from hook event payloads via resolveActorIdFromEvents (src/generation/auto-gen/resolve-actor-from-events.ts), which trusts the first non-empty data.actorId with no validation. MoodService.applyHappinessDelta then writes the happiness delta to that (possibly foreign or wrong) actor instead of the server-resolved generating character (characterId). Fix: pass characterId (server-resolved) for the mood write, or validate that hooks.actorId matches characterId before using it.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
