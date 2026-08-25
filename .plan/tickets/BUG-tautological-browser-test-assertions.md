# BUG: Tautological browser test assertions

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

HIGH: characters-flow.browser.ts:57 and smoke.browser.ts:146 assert OR-locator '[grid], [loading], [empty]' present — passes when grid render is fully broken (falls through to empty state). MED: chat-flow.browser.ts:186-188 asserts panel innerHTML contains template-source strings 'filteredChats'/'selectChat' — passes even if x-for never evaluates. LOW: smoke.browser.ts:262 types into input and asserts nothing else. Fix each to assert actual rendered behavior.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
