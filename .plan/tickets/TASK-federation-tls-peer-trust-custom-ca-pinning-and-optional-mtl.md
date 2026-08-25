# TASK: Federation TLS peer trust custom CA pinning and optional mTLS

**Status:** ⬜ Not Started
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

