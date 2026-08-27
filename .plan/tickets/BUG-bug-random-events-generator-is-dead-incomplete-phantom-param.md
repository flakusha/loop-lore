# BUG: BUG: random-events generator is dead/incomplete (phantom params, unpersisted)

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/chat/random-events.ts generateRandomEvent destructures db, worldId, locationId but never uses them (phantom API). Its only consumer (src/generation/auto-gen/post-store.ts) calls it and only logs the result; the event is never persisted or injected into the context window. randomEventToEventRef is unconsumed. Fix: either complete the feature (persist/inject the event) or remove the dead code and the orphan import.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
