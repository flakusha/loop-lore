<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: mesh device-relay fallback (store-and-forward via nearby federated peer)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-mesh-federation-content-sharing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-mesh-federation-content-sharing (server-to-server sealed-envelope mesh). Distinct axis from epic-federation-swarm-sync (fediverse/CRDT) and epic-anonymity-decentralization (BYOK resource mesh). Consumes prerequisite slices TASK-pwa-cached-shell-plus-send-queue-offline-survival-slice (ll-outbox-v1) and TASK-offline-outbox-sync-engine-shared-sqlite-outbox-plus-conflic (shared outbox contract).

Slice: store-and-forward via nearby federated peer when the server is unreachable from device A. A seals its outbox entries into ContentEnvelopes (existing envelope.ts seal: AES-GCM ciphertext plus SHA-256 hash, server-held cipher) and hands them to device B over a device-to-device channel; B forwards bytes to the server unopened. Relay is blind by construction: ciphertext-only, B learns nothing (no plaintext, no keys leave A). B replays bytes verbatim; receiver-side LWW dedup (delivery.ts) keeps relay duplicates idempotent. Outbox drains through the relay (same FIFO plus backoff contract as direct drain); relay failures stay queued with backoff. Trust: B must be a trusted peer row (peer-table pending/trusted verdicts, SPKI pin outbound pre-flight); PSK/HMAC envelope auth per peer-work-auth layered pattern — authorized relay, blind payload.

Channel options in order: (1) server-mediated relay dropbox (B online-to-server POSTs sealed bytes for A; no new transport, works today), (2) LAN mDNS discovery plus direct HTTPS device-to-device, (3) y-webrtc/libp2p data channel only if matrix-federation-decisions C3 swarm-transport lands (open, Phase D; do NOT hard-depend). Explicitly not building: CRDT merge, browser WebRTC signaling infra, Bluetooth/WiFi-Direct native transports.

Anchors: src/federation/envelope.ts:13-28 src/federation/outbox.ts:4-11 src/federation/peer-work-auth.ts:1-21 src/transport/peer-table.ts:36-46 .plan/matrix-federation-decisions.md:22-27
Refs: https://briarproject.org/how-it-works https://docs.libp2p.io/docs/circuit-relay

Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Acceptance:

- Device A offline-from-server plus online-to-device-B plus B online-to-server: A message delivered exactly once (server log one row; dedup absorbs relay retries).
- Relay learns nothing: B holds ciphertext only; E2E keys (ll-e2e-privkey-v1) never leave A; spot-check relay store shows no plaintext.
- Outbox drains through relay with same FIFO/backoff semantics as direct drain; relay-down keeps entries queued.
- Untrusted-B (pending/dead peer-table verdict) refused before any byte accepted; poison envelope quarantined, order preserved.
- No new deps beyond transports already evaluated (y-webrtc/libp2p decision-gated). bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
