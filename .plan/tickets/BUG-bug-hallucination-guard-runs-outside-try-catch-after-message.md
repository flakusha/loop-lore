# BUG: BUG: hallucination guard runs outside try/catch after message insert; DB error strands message

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/post-store.ts calls detectHallucinations(...) with no try/catch, AFTER storeMessage has already inserted the assistant message. If detectHallucinations throws (e.g. DB error querying world entities), applyPostStoreEffects throws, so completeGeneration / buffer append / signalDone / group cascade never run - the stored message is left with an uncompleted generation attempt and the SSE buffer is never signaled. Fix: wrap detectHallucinations (and the telemetry record) in try/catch consistent with the mood block, and ensure the attempt is completed or rolled back.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
