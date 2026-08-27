<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: HTTPS redirect enforcement for plaintext HTTP

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-certificate-and-tls-management.md

## Summary

When TLS is configured, plaintext HTTP requests should be permanently redirected to HTTPS (308). Today `src/server/start.ts` runs HTTP on `port` and HTTPS on `port+443` with no redirect. Clients hitting HTTP get no upgrade signal. This ticket adds configurable HTTPS redirect for all plaintext requests.

## Current state

- `src/server/start.ts` line 128-141: HTTPS server on `port+443`, HTTP server on `port`
- No redirect logic between them
- HSTS header ticket (`BUG-hsts-header-missing-from-response-policy.md`) covers the header but not the redirect
- Production TLS modes ticket mentions proxy termination but not direct redirect

## Direction

1. Add `tls.redirectHttp` config boolean (default: `true` when TLS enabled, `false` for proxy mode)
2. When enabled, HTTP server responds with `308 Permanent Redirect` to `https://host:port+443/path` for all non-ACME-challenge requests
3. Exclude `/.well-known/acme-challenge/` from redirect (needed for ACME HTTP-01 validation)
4. Preserve query string and path in redirect target
5. Config validation: redirect requires TLS to be enabled

## Acceptance criteria

- [ ] HTTP requests redirect to HTTPS with 308 status
- [ ] ACME challenge path excluded from redirect
- [ ] Query string and path preserved in redirect
- [ ] Redirect disabled in proxy mode (trustProxy handles it upstream)
- [ ] Test: GET / returns 308 with Location: https://; GET /.well-known/acme-challenge/ passes through

