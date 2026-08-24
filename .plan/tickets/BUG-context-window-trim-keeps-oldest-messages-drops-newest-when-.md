# BUG: Context window trim keeps oldest messages, drops newest when over budget

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/chat/context-window.ts:100 — phase-3 overflow trim iterates retained chronologically first-fit → keeps OLDEST, drops NEWEST when minRecent alone exceeds budget. Sliding window must keep most recent; iterate from end. Related minor: token-counter.ts:90 vs context-window.ts:113 two computeContextWindow fns with 0-1 vs 0-100 percentage semantics — rename one.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
