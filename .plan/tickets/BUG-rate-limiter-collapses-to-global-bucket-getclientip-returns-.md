# BUG: Rate limiter collapses to global bucket (getClientIp returns 'unknown')

**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Medium

## Summary

ROOT CAUSE: src/routes/auth/shared.ts getClientIp (L50-68) relies on request.remoteAddress, but Elysia/Bun do NOT set remoteAddress on the HTTP Request (source-confirmed: only WebSocket handles receive it). hasRemoteAddress() is therefore always false for HTTP. With server.trustProxy defaulting false (src/config/sections/server.ts L15), getClientIp returns the literal string 'unknown' for every request. IMPACT: loginLimiter and registerLimiter key all traffic under one bucket 'unknown', so the per-IP limit becomes a single GLOBAL limit. One client exhausting it blocks all other users (self-DoS / availability regression), and the intended per-IP brute-force isolation provides zero protection. FIX: derive the peer address from the Bun server connection (server.requestIP(request)) or the Elysia request context, not a non-existent property. Only consult X-Forwarded-For/X-Real-IP/CF-Connecting-IP when trustProxy is set AND the connection originates from a configured trusted proxy (strip client-supplied XFF first). Add a regression test asserting getClientIp returns a real, per-connection IP.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification (reproduced 2026-08-25)

Runtime reproduction confirms the collapse is the DEFAULT, always-broken behavior — not a deployment edge case. Minimal Bun.serve + Elysia handler hit over loopback:

- bare request.remoteAddress -> UNDEFINED (field absent from JSON; JSON.stringify drops undefined)
- Elysia ctx.request.remoteAddress -> UNDEFINED; Elysia ctx.ip -> UNDEFINED
- app.server.requestIP(ctx.request) -> {"address":"::ffff:127.0.0.1","family":"IPv6","port":52238} (real peer IP)

Conclusion: hasRemoteAddress(request) is always false for HTTP; with server.trustProxy defaulting false (src/config/sections/server.ts L15), getClientIp returns the literal "unknown" for every request, so loginLimiter + registerLimiter share ONE global bucket.

Dual failure mode:
1. trustProxy=false (default): all clients collapse into bucket "unknown" -> the limit is a single global throttle; one client exhausting it blocks all other users (self-DoS / availability regression) and the intended per-IP brute-force isolation is void.
2. trustProxy=true (behind a proxy): getClientIp trusts client-supplied X-Forwarded-For / X-Real-IP / CF-Connecting-IP first -> an attacker rotates XFF per request and bypasses the limiter entirely.

Correct fix: source the peer address from the Bun server connection (server.requestIP(request)), threaded into getClientIp; only consult proxy headers when the connection originates from a configured trusted proxy (strip client-supplied XFF first). Add a regression test asserting getClientIp returns a distinct, real per-connection IP.

## Blast radius (beyond rate limiting)

getClientIp is the single IP source for session creation, not just the limiter. login.ts (handleLogin L64, createSessionAndCookie L97), register.ts L118, and login.ts handleDemoLogin (L142-153) all pass getClientIp(request) into createSessionAndCookie, which stores it in the sessions.ip column. Because getClientIp always returns "unknown" (proven above), EVERY session row records ip="unknown" — destroying IP-based audit/forensics and any downstream IP logic. The regression is also invisible to tests: auth/login.test.ts L144-145 asserts user_id/token_hash but never asserts sessions.ip, so the bug is uncaught.
