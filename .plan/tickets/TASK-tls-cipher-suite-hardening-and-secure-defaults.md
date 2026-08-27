<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TLS cipher suite hardening and secure defaults

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-certificate-and-tls-management.md

## Summary

Bun.serve TLS defaults to BoringSSL's cipher list, which includes legacy ciphers for compatibility. No ticket exists to enforce modern, forward-secret-only cipher suites. This ticket restricts TLS to AEAD ciphers with PFS, disables TLS 1.0/1.1, and sets TLS 1.3 as preferred.

## Current state

- `src/server/start.ts` passes `{ key, cert }` to `Bun.serve` with no cipher/TLS-version options
- Bun's default cipher list includes CBC-mode ciphers and TLS 1.0/1.1 for compatibility
- No config surface for cipher selection or minimum TLS version
- Production TLS modes ticket (`TASK-production-tls-modes-byo-certs-acme-and-proxy-termination`) mentions `minVersion` but doesn't specify cipher policy

## Direction

1. Add `tls.ciphers` config (array of cipher suite names, OpenSSL format) with secure default: `TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384`
2. Add `tls.minVersion` config (default `1.2`, allow `1.3` for TLS-only deployments)
3. Pass `ciphers` and `minVersion` through to `Bun.serve({ tls: { key, cert, ciphers, minVersion } })`
4. Config validation: reject unknown cipher names at startup (fail fast)
5. Health endpoint: report active cipher list + min version for audit

## Acceptance criteria

- [ ] Server rejects connections using TLS 1.0/1.1 when minVersion=1.2
- [ ] Only AEAD ciphers with forward secrecy negotiable
- [ ] Config validation rejects invalid cipher names at boot
- [ ] Health endpoint exposes active TLS parameters
- [ ] Test: TLS 1.3 client connects successfully; TLS 1.1 client rejected

