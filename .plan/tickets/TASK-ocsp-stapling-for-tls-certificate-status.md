<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: OCSP stapling for TLS certificate status

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-certificate-and-tls-management.md

## Summary

Bun.serve supports OCSP stapling natively via `tls.ocspStapling` option. No ticket exists to enable it. OCSP stapling improves TLS handshake performance and privacy by letting the server provide certificate revocation status instead of clients querying the CA directly.

## Current state

- `src/server/start.ts` does not set `ocspStapling` in TLS options
- Bun supports `ocspStapling: true` which fetches and caches the OCSP response from the CA
- No config surface for OCSP stapling control
- ACME mode (in `TASK-production-tls-modes-byo-certs-acme-and-proxy-termination`) would benefit from OCSP stapling for Let's Encrypt certs

## Direction

1. Add `tls.ocspStapling` config boolean (default: `true` for ACME/manual modes, `false` for self-signed-dev)
2. Pass through to `Bun.serve({ tls: { ..., ocspStapling } })`
3. Log OCSP response status at startup (fresh/expired/unavailable)
4. Health endpoint: report OCSP stapling status and response age
5. Graceful fallback: if OCSP fetch fails, continue without stapling (don't block startup)

## Acceptance criteria

- [ ] OCSP stapling enabled for ACME/manual cert modes
- [ ] Disabled for self-signed-dev (no CA to query)
- [ ] OCSP status logged at startup
- [ ] Health endpoint reports stapling status
- [ ] Test: verify OCSP response present in TLS handshake (via openssl s_client -status)

