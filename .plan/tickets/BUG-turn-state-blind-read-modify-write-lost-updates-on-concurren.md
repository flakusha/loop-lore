# BUG: Turn state blind read-modify-write — lost updates on concurrent turns

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/turning/turn-manager/state.ts:11 — persistState does blind read-modify-write of story_state JSON column, no transaction/optimistic version; two TurnManager instances for same chat → lost updates on currentTurn/turnOrder/pendingRegeneration. Related minor lifecycle.ts:9: requestRegeneration overwrites pendingRegeneration without checking one pending. Fix: optimistic version column or tx with compare-and-swap.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
