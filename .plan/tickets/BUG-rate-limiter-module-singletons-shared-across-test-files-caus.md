# BUG: Rate-limiter module singletons shared across test files cause cross-file flakiness

**Status:** ✅ Done
**Priority:** low
**Effort:** Medium

## Summary

ROOT CAUSE: loginLimiter/registerLimiter in src/routes/auth/shared.ts are module-level singletons (one Map per process). auth/login.test.ts beforeEach (L82-86) calls resetLoginRateLimiter(), which clears the shared bucket Map; auth.test.ts imports resetRegisterRateLimiter. Bun runs test FILES in parallel within one process, so a beforeEach reset in one file races with limiter assertions in another file that imports the same singleton (via ./login or ./auth -> shared.ts). IMPACT: intermittent, non-deterministic test failures. Example: the 'returns 429 after 10 attempts' test in login.test.ts (L154-164) can be reset mid-run by another file's beforeEach, or observe pre-polluted state from a concurrently running file -> flaky 429 assertions. This is a negative-space / parallel-execution hazard surfaced during review; it does not affect production (singletons are intentionally process-lifetime there) but undermines test reliability. FIX: give tests an isolated limiter (inject a limiter instance, or expose a factory the tests construct) instead of mutating the process-wide singleton; or document the shared-state assumption and serialize the affected files via bun's preload/sequence. Add a guard so reset* only affects test-owned state.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: shared.ts limiter factories; per-file instances.
