# BUG: getClientIp trusts spoofable proxy headers unconditionally

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

src/auth/shared.ts:54-56 — trusts X-Forwarded-For/x-real-ip/CF-Connecting-IP whenever remoteAddress absent → login rate-limit bypass via header rotation; attacker-controlled IP stored in sessions rows. Fix: only trust these headers behind known proxy (config flag). Related minors: rate-limit.ts:41 fixed window mislabeled sliding + burst across boundary, keyed on spoofable IP; shared.ts:217 Secure cookie only when NODE_ENV=production (LL_COOKIE_SECURE override easy to forget).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed on dev (verified against HEAD a263608e): `getClientIp` (`src/routes/auth/shared.ts`) only trusts `X-Forwarded-For`/`x-real-ip`/`CF-Connecting-IP` when `config.server.trustProxy` is enabled (env `SERVER_TRUST_PROXY=1`, default false); otherwise returns the peer IP or `"unknown"`, and uses only the rightmost (proxy-appended) XFF entry. Related minors also landed: `rate-limit.ts` is now a genuine sliding-window timestamp queue and `setTokenCookie` honors `LL_COOKIE_SECURE` overrides before `NODE_ENV=production`. Covered by `src/routes/auth/get-client-ip.test.ts` (5 cases incl. spoofed-XFF-ignored, last-entry, unknown default).
