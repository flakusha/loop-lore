# BUG: HSTS header missing from response policy

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small

## Summary

Location: src/middleware/response-headers.ts (ResponseHeaderPolicy.apply) and src/config/sections/headers.ts (HeadersConfig).

Symptom: The response-header policy emits CSP, X-Frame-Options, Referrer-Policy, CORP, Permissions-Policy, etc., but does NOT emit Strict-Transport-Security. Confirmed by reading the policy + config. For HTTPS deployments this leaves the connection without HSTS enforcement (no max-age / includeSubDomains / preload), weakening transport-security posture. Note: the auth cookie sets Secure only in NODE_ENV=production (src/auth/shared.ts), which is correct, but HSTS is the complementary defense.

Root cause: HSTS was simply not included in the header set.

Fix: add an hsts config block (maxAge, includeSubDomains, preload) and emit Strict-Transport-Security when enabled and the request is HTTPS (or behind TLS-terminating proxy). Leave disabled by default for plain-HTTP/local dev to avoid lockout.

Acceptance: HSTS header present on HTTPS when enabled; absent on HTTP/dev by default; config documented; test added.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
