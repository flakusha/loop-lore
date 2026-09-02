<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Mesh Coordinator Server — Knowledge DB, Addresses, Trusted Keys, Negotiations, Resync Cron

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-mesh-federation-content-sharing

## Summary

Design and implement the mesh coordinator server — a dedicated app that
can run standalone or alongside a loop-lore instance — maintaining a
knowledge DB of all federated servers: their addresses, trusted public
keys, capabilities, status, and last-seen timestamps. Provides the
negotiation protocol for server-to-peer session establishment and
configurable cron jobs that drive periodic resyncs.

This is the control plane for server-to-server mesh federation. It is a
distinct concern from the in-host `local-swarm-router`
(`epic-local-process-swarm.md`) and from the swarm CRDT reconciliation
(`FEAT-swarm-mode-reconciliation.md`).

## Why

Without a coordinator, federated servers have no shared source of truth
about each other. There is no mechanism to discover peer addresses,
establish trust, negotiate session parameters, or schedule resyncs. The
existing `TASK-swarm-router-dedicated-vps-federation-of-locally-running-ins.md`
is a thin stub (AC: "implementation complete") that provides no design
for this control plane.

## Current State

- `TASK-swarm-router-dedicated-vps-federation-of-locally-running-ins.md`
  exists but has no design for a coordinator knowledge DB, negotiation
  protocol, or resync cron jobs.
- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl`
  covers transport TLS trust (custom CA, SPKI pinning, mTLS) but does
  not cover the coordinator or the knowledge DB.
- No knowledge DB, negotiation protocol, or resync cron infrastructure
  exists for server-to-server mesh federation.

## Acceptance Criteria

- [ ] Coordinator server designed as a separate app; can run standalone
  or alongside a loop-lore instance.
- [ ] Knowledge DB stores per-server: address (host + port), public key,
  capabilities, status (online/offline/unknown), last-seen timestamp,
  and a version vector for conflict detection.
- [ ] Trusted key management: register, rotate, and revoke peer signing
  keys. Keys stored encrypted at rest per `epic-crypto.md` key-at-rest
  standard. Rotation is atomic and versioned.
- [ ] Negotiation protocol: server-to-server session negotiation
  (auth handshake, capability exchange, encryption parameter agreement,
  quota negotiation). State machine with defined transitions.
- [ ] Resync cron jobs: configurable per-peer schedules (full state
  resync, incremental diff, content-specific). Cron expressions or
  interval-based configuration.
- [ ] Coordinator API: CRUD for server records, key management,
  negotiation session status, cron schedule management.
- [ ] `bun run check` green; unit tests for knowledge DB CRUD, key
  rotation, negotiation state machine, cron evaluation.
- [ ] Coordinator does not have access to plaintext content. It manages
  metadata and control plane only.

## Implementation Notes

- **Separate app**: the coordinator is a standalone Bun app (not
  embedded in a loop-lore instance). Deploy as its own process;
  communicate with loop-lore instances via HTTP/WebSocket.
- **Knowledge DB**: Kysely-backed or a lightweight embedded store
  (e.g., `bun:sqlite`). Schema designed for the server knowledge
  records described above.
- **Key store**: integrate with `epic-certificate-and-tls-management.md`
  for transport certificates; add a separate key store for peer
  signing keys used in content signing and verification.
- **Negotiation protocol**: modeled as a state machine (idle →
  handshake → capability-exchange → quota-agreement → established →
  closed). Use existing `EncryptionProvider` for encryption of
  negotiation messages.
- **Resync cron**: use a lightweight cron library (e.g., `bun-cron` or
  a native timer-based scheduler). Per-peer schedules stored in the
  knowledge DB. Resync jobs should be idempotent and safe to re-run.
- **Security**: all coordinator ↔ server communication is TLS-encrypted
  (per `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl`).
  Coordinator authenticates every request. No plaintext content ever
  touches the coordinator.
- **Sequence**: Phase 1 of `epic-mesh-federation-content-sharing`.
  Must complete before Phase 2 (encrypted content sharing) and Phase
  3 (quota).

## Files

- `src/mesh-coordinator/` (new): `server.ts`, `knowledge-db.ts`,
  `key-store.ts`, `negotiation.ts`, `resync-cron.ts`, `api.ts`,
  `schema.ts`
- `src/db/migrations/` — new migration for coordinator knowledge DB
- `src/config/sections/` — mesh coordinator config section
- `tests/` — unit tests for knowledge DB, key rotation, negotiation
  state machine, cron evaluation

## Dependencies

- `epic-mesh-federation-content-sharing` (this epic)
- `epic-certificate-and-tls-management.md` — transport TLS
- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl`
  — per-peer CA/pinning
- `epic-communications-integrations.md` — `EncryptionProvider` seam
- `epic-crypto.md` — key-at-rest standard
- `epic-federation-swarm-sync.md` — fediverse federation (distinct axis)
- `FEAT-swarm-mode-reconciliation.md` — CRDT state sync, HLC/vector clocks
  (for conflict detection during resync)
