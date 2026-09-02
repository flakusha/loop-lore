<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Mesh Encrypted Content Sharing, Reservation & Duplication

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-mesh-federation-content-sharing

## Summary

Implement encrypted content distribution between federated loop-lore
servers: content sharing (end-to-end encrypted transfer), reservation
(pre-allocating storage on target servers before push), and duplication
(replicating content across designated peers for redundancy and
data-saving).

This phase requires the mesh coordinator server
(`TASK-mesh-coordinator-server-knowledge-db`) to be complete, as it
provides the knowledge DB for target server discovery and the
reservation manager for pre-allocating storage.

## Why

When a world or channel exists across multiple federated servers, content
must be shared encrypted in transit and at rest. Without reservation, a
push can fail when the target server runs out of space. Without duplication,
there is no redundancy or data-saving across the mesh. Currently, each
loop-lore instance operates as an island — no cross-server content
distribution exists.

## Current State

- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl`
  covers transport-level TLS trust only. No content-level encryption
  for cross-server distribution exists.
- `epic-communications-integrations.md` defines the `EncryptionProvider`
  seam for E2EE (Matrix/OMEMO, PGP for e-mail), but it is scoped to
  client-to-server messaging, not server-to-server content distribution.
- No reservation, duplication, or encrypted content-sharing mechanism
  exists for server-to-server federation.

## Acceptance Criteria

- [ ] Content shared between federated servers is encrypted end-to-end
  using the existing `EncryptionProvider` seam. No plaintext content
  crosses the mesh.
- [ ] Reservation: before pushing content to a target peer, the sending
  server reserves storage capacity on that peer via the coordinator.
  Reservation includes expected size, content type, and target peer.
  Reservation fails if the target peer lacks capacity.
- [ ] Reservation lifecycle: reserve → push → confirm → release.
  Reservations expire if the push does not complete within a timeout.
  Reservation cleanup on expiry is idempotent and safe.
- [ ] Duplication: content is replicated across designated peers based
  on a duplication policy (e.g., replicate core assets to nearby peers,
  or replicate to all peers in a region). Duplication policy is
  configurable per-world or per-channel.
- [ ] Duplication respects reservations: a peer only receives a copy if
  it has a valid reservation.
- [ ] Conflict handling during content push: use causality clocks
  (HLC/vector clocks from `FEAT-swarm-mode-reconciliation`) to detect
  and resolve conflicts. Newer content wins; conflicts are logged and
  surfaced via the coordinator.
- [ ] `bun run check` green; integration test encrypts content on Server
  A, pushes to Server B, decrypts and verifies content integrity.
- [ ] Content integrity verified after decryption (hash/checksum match).

## Implementation Notes

- **Encryption**: reuse the existing `EncryptionProvider` seam from
  `epic-communications-integrations.md`. The `EncryptionProvider`
  already supports per-key encryption; extend it to support
  server-to-server content encryption keys if not already compatible.
- **Reservation protocol**: sending server → coordinator → target peer.
  The coordinator validates capacity and creates a reservation record.
  The sending server then pushes the encrypted content directly to the
  target peer (or via the coordinator, depending on topology decision).
- **Duplication policy**: a configurable rule set (e.g., "duplicate
  world core assets to all peers in the same region", "duplicate to
  N nearest peers"). Policy stored in the coordinator's knowledge DB.
- **Content format**: encrypted content is wrapped in an envelope that
  includes metadata (content hash, content type, size, origin server,
  causality clock) alongside the ciphertext. The envelope format is
  defined as part of this ticket.
- **Conflict resolution**: use HLC/vector clocks to order content
  versions. On conflict, the newer version wins. Conflicts are logged
  and surfaced via the coordinator's API.
- **Integrity**: every content push includes a hash (e.g., SHA-256) of
  the plaintext before encryption. The receiving server verifies the
  hash after decryption.
- **Sequence**: Phase 2 of `epic-mesh-federation-content-sharing`.
  Depends on Phase 1 (coordinator knowledge DB) being complete.

## Files

- `src/mesh-content/` (new): `sharing.ts`, `reservation.ts`,
  `duplication.ts`, `envelope.ts`, `conflict-resolution.ts`
- `src/db/migrations/` — new migration for content reservation and
  duplication records
- `src/encryption/` — extend `EncryptionProvider` for server-to-server
  content encryption if needed
- `tests/` — integration test: encrypt → push → decrypt → verify;
  reservation lifecycle test; duplication policy test; conflict test

## Dependencies

- `epic-mesh-federation-content-sharing` (this epic)
- `TASK-mesh-coordinator-server-knowledge-db` — Phase 1 (knowledge DB,
  reservation manager, target server discovery)
- `epic-communications-integrations.md` — `EncryptionProvider` seam
- `FEAT-swarm-mode-reconciliation.md` — HLC/vector clocks for conflict
  detection during content push
- `epic-crypto.md` — encryption key management
