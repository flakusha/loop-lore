# BUG: Limiter is fixed-window but mislabeled sliding-window (2x boundary burst)

**Status:** done

**Priority:** high
**Effort:** Medium

## Summary

src/middleware/rate-limit.ts check() (L37-50): bucket stores windowStart and resets the ENTIRE counter when now-windowStart > windowMs — a fixed window, not a sliding window. The docstring (L7) and rate-limit.test.ts header (L2) falsely claim 'sliding-window'. Verified by passing test 'opens a new window after windowMs elapses'. IMPACT: classic fixed-window boundary burst. An attacker sends maxRequests at the end of window N and maxRequests at the start of window N+1 = 2x maxRequests within a windowMs span. login=10/min -> ~20 attempts across the boundary; register=3/hour -> ~6. Weakens brute-force protection. FIX: implement a true sliding window (per-request timestamp log or token bucket), OR if fixed-window is acceptable, correct the docstring/tests and tighten maxRequests to compensate. Expose remaining/reset so callers can emit Retry-After (see sibling ticket).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification (reproduced 2026-08-25)

Reproduction with createRateLimiter({ windowMs: 1000, maxRequests: 3 }) driving check() across the window boundary (Date.now overridden in the repro):

  r1 t=0 ALLOW; r2 ALLOW; r3 ALLOW; r4 BLOCK; r5 t=999 BLOCK;
  r6 t=1001 ALLOW; r7 ALLOW; r8 ALLOW; r9 BLOCK

=> 6 allowed within a ~1000ms span (limit 3/window) = 2x burst.

Confirms fixed-window semantics: the entire counter resets at windowStart+windowMs, so a client spends the full budget at the end of one window and again at the start of the next. The docstring (src/middleware/rate-limit.ts L7) and the test header (rate-limit.test.ts L2) falsely claim "sliding-window".
