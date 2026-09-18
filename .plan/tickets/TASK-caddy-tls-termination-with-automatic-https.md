<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Caddy TLS termination with automatic HTTPS

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (landed on dev, 2026-09-18)
**Priority:** Medium
**Effort:** Medium

## Summary

Replace self-signed-only TLS with Caddy reverse-proxy termination: Caddyfile for VPS (ACME auto-issue/renew) + local (internal CA), compose wiring, SERVER_TRUST_PROXY docs, public origin config for federation/redirects behind proxy, keep ensureTlsCerts as fallback. Update build-deploy.md nginx topology to Caddy.

## Resolution

Landed on dev by 57dc551de (feat(tls): terminate TLS at Caddy with automatic HTTPS). Verified 2026-09-18 against current dev:

- `deploy/Caddyfile` — ACME auto-issue/renew (`tls {$ACME_EMAIL}`), HTTP-01 + TLS-ALPN, HSTS + security headers, `reverse_proxy app:3000` with `flush_interval -1`
- `deploy/Caddyfile.local` — trusted local HTTPS via `tls internal` + one-time `caddy trust`
- `deploy/docker-compose.yml` — Caddy on 80/443, cert persistence in `caddy_data`/`caddy_config` volumes, `SERVER_TRUST_PROXY=1`, `SERVER_PUBLIC_ORIGIN`
- `src/config/cert.ts` — `ensureTlsCerts` retained as self-signed fallback (openssl absent → null → HTTP-only)
- `docs/spec/build-deploy.md` — topology documented as Caddy
- Git issue: absent from `giwt issues` (50 open, none TLS) and `giwt show` → not found — no issue linkage to reconcile

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
