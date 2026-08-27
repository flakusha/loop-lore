# BUG: Cancellation lifecycle: DB failure permanently marks chat generating; state machine advisory only

**Status:** ✅ Resolved (failGeneration + completeGeneration DB writes wrapped in try/catch; in-memory cleanup runs regardless)
**Priority:** medium

## Summary

src/generation/cancellation-tracker/lifecycle.ts:186 — failGeneration awaits updateAttemptStatus before deleting maps, no try/catch; DB write failure → isChatGenerating(chatId) true permanently, status endpoint lies. Fix: clean maps in finally. Related: state.ts:33 safeTransition logs invalid transition then applies it anyway (advisory state machine — reject instead); lifecycle.ts:74 stalled provider connection = orphaned in-flight HTTP request with no timeout.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
