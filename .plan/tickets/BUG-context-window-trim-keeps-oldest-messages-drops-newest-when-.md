<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Context window trim keeps oldest messages, drops newest when over budget

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (verified 2026-09-07; bookkeeping)
**Priority:** high
**Effort:** Medium

## Summary

src/chat/context-window.ts:100 — phase-3 overflow trim iterates retained chronologically first-fit → keeps OLDEST, drops NEWEST when minRecent alone exceeds budget. Sliding window must keep most recent; iterate from end. Related minor: token-counter.ts:90 vs context-window.ts:113 two computeContextWindow fns with 0-1 vs 0-100 percentage semantics — rename one.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Verified on dev HEAD (2026-09-07). src/chat/context-window.ts phase-3 overflow trim iterates `retained` from end to start (newest first), greedily keeping messages that fit the budget and dropping those that don't. The retained array is then re-sorted chronologically before return. Covered by src/chat/context-window.test.ts phase-3 suite (describe `computeContextWindow — phase 3 overflow trim`): `drops oldest messages when recent alone exceed the budget` and `always retains the newest message on overflow`.
