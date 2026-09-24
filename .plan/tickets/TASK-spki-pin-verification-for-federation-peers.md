<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: SPKI pin verification for federation peers

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** medium
**Effort:** Small
**Epic:** epic-certificate-and-tls-management.md
**Related:** TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl

## Summary

Implement leaf-SPKI pin verification for federation peer fetches, consuming the
already-typed `trust.spkiPins` field (`FederationPeerTrustConfig`). Runtime
feasibility is proven: on Bun v1.4.2, `node:tls` `tls.connect` +
`getPeerCertificate(true)` returns raw DER and a SHA-256 pin computes cleanly
(probed 2026-09-09 against a local TLS server).

## Direction

1. `verifyPeerPin(origin, pins: string[]): Promise<boolean>` in
   `src/federation/` — `node:tls` pre-flight with `rejectUnauthorized: false`
   and a `checkServerIdentity` override that captures the leaf cert, hashes the
   SubjectPublicKeyInfo (SHA-256, base64), compares against `pins`.
2. Verdict cache per origin per gossip TTL (avoid a handshake per poll).
3. `GossipService.pollOnce` calls it before fetch when `trust.spkiPins` is set;
   mismatch → skip fetch, peer goes stale, structured log.
4. Document the verify-then-fetch TOCTOU explicitly; full elimination
   (HTTP-over-own-TLS-socket) is deferred as not worth the complexity today.

## Acceptance Criteria

- [ ] Matching pin → fetch proceeds; mismatching pin → skip + stale + log.
- [ ] Cached verdict reused within TTL; expired verdict re-verified.
- [ ] Tests against a real loopback TLS server (self-signed fixture cert).
- [ ] `bun run check` green.
