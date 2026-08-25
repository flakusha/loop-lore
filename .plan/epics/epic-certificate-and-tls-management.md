<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Certificate & TLS Management

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Type:** Task
**Tags:** tls, https, certificates, acme, federation, security, transport

## Summary

Move TLS from "dev-grade in-place key generation" to a managed certificate subsystem serving every TLS consumer: HTTPS/WSS server identity, federation peer trust, and future mTLS instance authentication. Current state is acceptable for development only and silently degrades in production.

## Current State (reviewed)

- `src/config/cert.ts` — `ensureTlsCerts()`: if `server.tls.{key,cert}` files are missing, spawns `openssl req -x509` (RSA-2048, 365 days, CN=localhost, no SAN beyond implicit CN) to generate an ephemeral self-signed pair. If OpenSSL is absent, logs a warning and returns null → server continues **HTTP-only**, unencrypted, with no config-level way to forbid that.
- `src/server/start.ts` — single `Bun.serve({ tls })` using the pair; WebSocket transport (`src/transport/factory.ts`, `base.ts`) shares the same `{key, cert}` object.
- Config surface (`src/config/sections/server.ts`) is paths-only: no CA-chain slot, no encrypted-key passphrase, no minimum-TLS-version knob, no dev/prod mode distinction for the self-signed path.
- Zero lifecycle handling anywhere: no expiry checks, no renewal, no monitoring hookup, no health-endpoint verdicts.
- Federation epics (FEAT-activitypub-federation, FEAT-swarm-mode-reconciliation) require outbound HTTPS to peers with real validation; today there is no trust-policy surface (custom CA pool, pinning) nor mTLS client-cert option.

## Why Not Just HTTPS

The same certificate subsystem has multiple consumers and trust directions:

| Consumer | Direction | Need |
| --- | --- | --- |
| Web UI / REST | inbound server identity | BYO certs or ACME; reverse-proxy termination mode |
| WebSocket (WSS) | inbound, shares server cert | same pair; must survive rotation without restart where possible |
| ActivityPub delivery/fetch (outbound) | client → peer servers | OS trust store by default; custom CA pool + pinning for self-hosted peers |
| Swarm sync links | bidirectional instance-to-instance | optional mTLS client certificates |
| Local/LAN deployments | inbound | self-signed acceptable **only** in explicit dev/local mode, never as silent fallback |

## Work Items

- [ ] **Production TLS configuration** — BYO certs with full chain (`ca`), ECDSA-first defaults, encrypted-key passphrase, min TLS version; explicit modes: `self-signed-dev`, `manual`, `acme`, `proxy` (termination upstream, honors existing `trustProxy`). Self-signed generation forbidden outside dev/local mode. → TASK-production-tls-modes-byo-certs-acme-and-proxy-termination
- [ ] **Certificate lifecycle & health** — startup + scheduled expiry sweep (warn ≥30d, critical ≤7d), rotation guidance/hook, verdicts published to the shared health-endpoint surface used by backup/integrity tickets. → TASK-certificate-lifecycle-expiry-monitoring-and-health-verdicts
- [ ] **Federation trust & mTLS** — outbound validation policy (reject invalid by default), custom CA bundle + per-peer pinning for self-hosted instances, optional mTLS client certs for swarm instance auth. → TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl

## Non-Goals

- Key-management internals of E2E chat keys / asset encryption subkeys (HKDF/AES-GCM pipeline) — owned by the crypto epics; this epic covers *transport* certificates and their lifecycle only.
- Running an internal CA service.

## Acceptance Criteria

- [ ] All three work items completed and cross-linked.
- [ ] No code path silently serves plain HTTP or auto-generates self-signed certs in production mode.
- [ ] Cert expiry surfaced through the shared health endpoint; degraded verdict on approaching expiry.
