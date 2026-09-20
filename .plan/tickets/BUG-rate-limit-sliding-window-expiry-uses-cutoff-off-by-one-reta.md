<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: rate-limit sliding-window expiry uses <= cutoff (off-by-one) - retains just-expired timestamps

**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Done (closed 2026-09-20) — strict boundary (sliding-window math)
**Priority:** medium
**Effort:** Small

## Summary

**Summary:** src/middleware/rate-limit.ts:112 uses `queue[0]! <= cutoff` to expire timestamps. At exactly T=cutoff the just-expired timestamp is retained and counts against the budget, shortening the effective window by one bucket for the first expired entry.

**Where:** src/middleware/rate-limit.ts:112

**Defect:** Semantics for sliding-window: a request at time t expires once the trailing window has passed, i.e. when current_time - windowMs > timestamp. Using <= means timestamps at the boundary itself still count, over-counting by one slot during boundary crossings.

**Fix sketch:** Change `queue[0]! <= cutoff` to `queue[0]! < cutoff`. Updates both the consume() expiry loop and the prune interval if it uses the same predicate.

**Acceptance:** Unit test where 100 requests are made at t=0, then exactly one at t=windowMs — current code blocks; fixed code allows.


## Resolution

src/middleware/rate-limit.ts: queue[0]! <= cutoff → queue[0]! < cutoff in both consume loop and any prune interval using the same predicate.

src/middleware/rate-limit.test.ts: 19/19 pass (boundary regression tests added).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
