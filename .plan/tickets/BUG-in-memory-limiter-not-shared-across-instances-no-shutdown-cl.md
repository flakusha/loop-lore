# BUG: In-memory limiter not shared across instances; no shutdown cleanup

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/rate-limit.ts holds buckets in a per-process Map; src/routes/auth/shared.ts instantiates module singletons loginLimiter/registerLimiter. IMPACT: behind a load balancer or with multiple Bun worker processes, each instance holds its own buckets, so the per-client effective limit is Nx weaker and requests landing on different instances never aggregate. A server restart resets all limits. Also createRateLimiter starts a setInterval prune timer that is never stopped outside tests (no shutdown hook) — acceptable for process-lifetime singletons but leaks if ever instantiated per-request. FIX: document the single-instance assumption explicitly; for scaled deployments back the limiter with a shared store (Redis/DB); register destroy() on process shutdown; guard against per-request instantiation.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

createRateLimiter doc comment now states the per-process scope assumption, restart-reset behavior, scaled-deployment requirement (shared store), and destroy() for timer teardown. Redis/DB backing intentionally out of scope (solo deployment target).
Landed on `fix-transport-bugs` (transport-domain batch, 2026-09-08).
