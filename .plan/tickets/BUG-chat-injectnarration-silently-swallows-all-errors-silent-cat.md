# BUG: chat: injectNarration silently swallows all errors (silent catch)

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/chat/service/transitions.ts lines 175-178: injectNarration has a bare catch that swallows all errors including DB failures, violating the no-silent-catch convention. Fix: at minimum log via the structured logger; rethrow or handle DB failures explicitly.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
