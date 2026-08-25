# TASK: Implement per-connection IP sourcing for auth rate limiters

**Status:** ✅ Resolved (2026-08-25, worktree `fix-ratelimiter-global-bucket`)
**Priority:** critical
**Effort:** Medium

## Summary

Replace getClientIp's request.remoteAddress probe (never set for HTTP in Bun/Elysia — always undefined) with Bun server.requestIP(request) threaded from the Elysia route context into handleLogin/handleRegister/handleSoloLogin. Default-deny proxy-header handling stays: X-Forwarded-For/X-Real-IP/CF-Connecting-IP are consulted only when server.trustProxy is enabled AND the peer connection is honored; strip client-supplied hop-by-hop XFF entries first. Fixes BUG-rate-limiter-collapses-to-global-bucket-getclientip-returns-.md (critical): with the current default-deny path every HTTP client collapses into the single 'unknown' bucket, turning login/register per-IP limits into one global throttle. Acceptance: distinct clients get distinct limiter buckets; trustProxy=false ignores spoofed XFF; trustProxy=true honors only proxy-appended headers; unit tests cover all three paths.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
