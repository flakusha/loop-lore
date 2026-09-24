<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Federation TLS peer trust custom CA pinning and optional mTLS

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** medium
**Effort:** Medium
**Epic:** epic-certificate-and-tls-management.md

## Summary

Define outbound/inbound trust policy for federation traffic; today there is no surface for validating peer certificates, trusting self-hosted CAs, or presenting client certs. Epic: epic-certificate-and-tls-management.md. Cross: FEAT-activitypub-federation, FEAT-swarm-mode-reconciliation.

## Current state

- No federation HTTP client exists yet (epics are pre-implementation); this ticket lands the TLS policy before the client code bakes in Node/Bun fetch defaults.
- Bun fetch validates against OS trust store only; no per-request CA bundle or pinned-peer concept anywhere.
- Swarm instance-to-instance links have no mTLS story (auth currently token-based per auth epics).

## Direction

1. Federation HTTP client wrapper owns TLS options: default = OS trust store, reject invalid (never disable validation globally).
2. Per-peer overrides: trust custom CA bundle (self-hosted instances behind home CAs) and/or SPKI pinning keyed by peer origin; stored alongside peer metadata.
3. Optional mTLS for swarm links: config points at client cert/key presented to peer instances that require it; peers may also require client certs - document pairing.
4. Failure semantics: TLS failure of a peer marks delivery backoff + verdict log, never plaintext downgrade.

## Acceptance criteria

- [ ] Wrapper defaults to strict validation; no escape hatch disables verification fleet-wide (config rejects).
- [ ] Custom CA bundle and SPKI pinning configurable per peer; drill against a self-hosted CA-signed instance passes.
- [ ] mTLS client cert presentation verified against an requiring-client-cert endpoint in a test fixture.
- [ ] Peer TLS failures feed delivery backoff and structured logs.


## Progress 2026-09-09 (federation-mesh-core + probes)

- LANDED: the federation HTTP client now exists (`src/federation/peer-fetch.ts`,
  driven by `GossipService`). Strict-by-default validation holds (Bun OS store;
  no fleet-wide escape hatch). Per-peer custom CA bundles ship via a typed
  `safeFetch` `tls.ca` passthrough, verified live against a self-signed
  instance (plain fetch rejected, `tls.ca` fetch 200). Trust map keys off
  `config.federation.peers[].trust`. TLS misses mark peers stale (eviction by
  TTL) with structured cron logs — partial backoff feed (no delivery queue yet).
- PROBED (2026-09-09, Bun v1.4.2): `node:tls` exposes the peer certificate —
  `tls.connect` + `getPeerCertificate(true)` returns raw DER; SHA-256 SPKI
  pin computed successfully against a local TLS server. So SPKI pinning IS
  implementable despite Bun fetch exposing no cert handle.
- Recommended SPKI design (new TASK filed): `verifyPeerPin(origin, pins)`
  opens a node:tls pre-flight with `rejectUnauthorized: false` and a
  `checkServerIdentity` override that captures + compares the leaf SPKI,
  caches the verdict per origin per TTL; gossip calls it before fetch when
  `trust.spkiPins` is set. Documented TOCTOU (verify-then-fetch race);
  full elimination needs HTTP-over-own-TLS-socket (deferred).
- mTLS: no app-code path (Bun fetch has no client-cert option). Recommended
  story is proxy-terminated: Caddy `reverse_proxy` transport client certs
  outbound + `tls_client_auth` inbound; app keeps token auth behind the proxy.
  No new app code planned — deploy docs only.

## Residual acceptance

- [x] Strict-by-default wrapper, no global escape hatch.
- [x] Custom CA bundle per peer, drilled live.
- [ ] SPKI pinning per peer (design above; awaiting implementation TASK).
- [ ] mTLS (deploy-story; app side intentionally out of scope).
- [ ] Peer TLS failures feed delivery backoff (stale-marking only; queue work
      belongs to the delivery-reliability ticket).
