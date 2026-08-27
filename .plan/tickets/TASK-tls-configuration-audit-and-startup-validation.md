<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TLS configuration audit and startup validation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-certificate-and-tls-management.md

## Summary

No ticket exists for validating TLS configuration at startup beyond cert file existence. This ticket adds comprehensive TLS config audit: cert/key match verification, chain validation, expiry pre-check, cipher name validation, and a structured health report for the TLS subsystem.

## Current state

- `src/config/cert.ts` `ensureTlsCerts()` checks file existence only
- No verification that key matches certificate
- No chain validation (cert → CA → root)
- No startup audit log of TLS parameters
- Health endpoint has no TLS-specific section

## Direction

1. Startup audit: verify key-cert pair match (Bun.crypto or openssl x509 -modulus comparison)
2. Chain validation: if `ca` config provided, verify cert chains to CA
3. Parse and log: notBefore, notAfter, issuer, subject, SANs, signature algorithm, key type/size
4. Cipher validation: reject unknown cipher names at config load (fail fast before serve)
5. Health endpoint: add `tls` section with cert fingerprint, days until expiry, cipher list, protocol version
6. Structured warning: if RSA key < 2048 bits or ECDSA < 256 bits, log warning

## Acceptance criteria

- [ ] Startup rejects mismatched key/cert pairs with clear error
- [ ] Chain validation fails fast if cert doesn't chain to provided CA
- [ ] TLS parameters logged at startup (issuer, expiry, key type, SANs)
- [ ] Health endpoint exposes TLS fingerprint + days until expiry
- [ ] Test: mismatched key/cert rejected at startup; valid pair passes audit

