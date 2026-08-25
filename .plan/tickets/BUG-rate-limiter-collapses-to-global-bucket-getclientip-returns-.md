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
