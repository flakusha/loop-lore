# BUG: BUG: hallucination guard runs outside try/catch after message stored

**Status:** ✅ Done
**Priority:** high
**Effort:** Low

## Summary

In `src/generation/auto-gen/auto-generation.ts`, `detectHallucinations(...)` runs AFTER `storeMessage(...)` inserts the assistant message but BEFORE `completeGeneration` / buffer append / `signalDone` / group cascade. A thrown DB error inside `detectHallucinations` unwound `applyPostStoreEffects`, leaving the stored message with an uncompleted generation attempt and an SSE buffer that was never signaled. Fix: mirror the mood block — wrap the `detectHallucinations` call in try/catch, default `hallucinationAnalysis` to no-detections on error, log and continue.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed in commit `d5e3a72e` (`fix(gen): wrap detectHallucinations in try/catch so DB error does not strand stored message`). The guard is now wrapped in try/catch matching the mood block pattern; on error, `hallucinationAnalysis` defaults to no-detections and the generation pipeline continues to `completeGeneration` / `signalDone`. Index marked done; this file was out of sync.
