<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Mesh Federation — Encrypted Content Sharing, Quota & Coordinator Server

**Status**: 🟡 Draft — analysis complete, tickets scoped
**Priority**: medium
**Effort**: Very High
**Type**: Architecture / Feature Epic
**Tags**: mesh, federation, encrypted-sharing, quota, coordinator-server
**Assignee**:

## Summary

Server-to-server mesh federation for loop-lore instances: encrypted content
sharing with reservation and duplication for data saving between multiple
federated servers, content federation quota enforcement, and a mesh coordinator
server (designed as a separate app) that maintains a knowledge DB of server
addresses, trusted keys, negotiation state, and cron jobs for resyncs.

This epic covers a distinct axis from `epic-federation-swarm-sync.md`
(fediverse / ActivityPub actor federation and CRDT peer sync) and from
`epic-anonymity-decentralization.md` (Tor/I2P + BYOK resource-sharing mesh).
Those epics address *client-to-fediverse* and *user-to-platform* decentralization;
this epic addresses *server-to-server* mesh federation — loop-lore instances
operating as a coordinated cluster with encrypted content distribution, quota
governance, and a coordinator that knows every peer.

## Motivation

loop-lore instances that operate as a cluster need three capabilities that no
existing epic covers:

1. **Encrypted content sharing, reservation, duplication** — when a world or
   channel exists across multiple federated servers, content must be shared
   encrypted in transit and at rest, with reservation (pre-allocating storage
   on target servers before pushing) and duplication (replicating for
   redundancy / data-saving across the mesh). Today there is no mechanism for
   this; each instance is an island.

2. **Content federation quota** — servers need enforceable quotas on how much
   content they federate to/from each peer (bandwidth, storage, message count).
   Without quotas, a misbehaving or high-traffic peer can exhaust resources on
   the receiving side. No existing epic addresses server-to-server quota.

3. **Mesh coordinator server** — a dedicated server (designed as a separate app,
   can run alongside a loop-lore instance or standalone) that maintains a
   knowledge DB of all federated servers: their addresses, trusted public keys,
   active negotiation sessions, and cron jobs that drive periodic resyncs.
   This is the control plane for the mesh. No existing epic designs this.

## Current State Assessment

- **Covered, do not re-scope:**
  - Fediverse / ActivityPub federation (`epic-federation-swarm-sync.md`,
    `FEAT-activitypub-federation`) — client-to-fediverse, not server-to-server.
  - Swarm CRDT multi-writer sync (`FEAT-swarm-mode-reconciliation`) — peer state
    sync, not encrypted content distribution or quota.
  - BYOK mesh (`epic-anonymity-decentralization.md`, Phase 4) — resource sharing
    (GPU/CPU/storage/bandwidth) with reputation/ledger, not encrypted content
    sharing or server knowledge DB.
  - TLS peer trust (`TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl`)
    — transport trust only; does not cover content sharing, reservation,
    duplication, or quota.
  - Swarm router dedicated VPS (`TASK-swarm-router-dedicated-vps-federation-of-locally-running-ins.md`)
    — extremely thin ticket (AC: "implementation complete"); no design for
    coordinator knowledge DB, negotiations, or resync cron jobs.

- **Uncovered gaps (this epic):**
  - Encrypted content sharing, reservation, duplication between federated servers.
  - Content federation quota between servers.
  - Mesh coordinator server: knowledge DB, server addresses, trusted keys,
    negotiations, cron jobs for resyncs.

## Scope (this epic adds)

### Phase 1 — Mesh Coordinator Server & Knowledge DB

A dedicated server application that maintains the mesh control plane:

- **Knowledge DB**: server addresses, public keys, capabilities, status, and
  last-seen timestamps for every federated server.
- **Trusted key management**: register, rotate, and revoke peer signing keys.
  Integrates with `epic-certificate-and-tls-management.md` for transport TLS
  and `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` for
  per-peer CA/pinning policy.
- **Negotiation protocol**: server-to-server session negotiation (auth handshake,
  capability exchange, quota agreement, encryption parameter negotiation).
- **Resync cron jobs**: configurable periodic resync schedules per peer (full
  state resync, incremental diff, or content-specific).
- **Deployment**: designed as a separate app; can run standalone or alongside a
  loop-lore instance.

### Phase 2 — Encrypted Content Sharing, Reservation & Duplication

Encrypted content distribution across the mesh:

- **Encrypted content sharing**: content is encrypted end-to-end between
  federated servers using the existing `EncryptionProvider` seam
  (`epic-communications-integrations.md`). Shared content is encrypted in
  transit and at rest on each peer.
- **Reservation**: before pushing content to a peer, the sending server
  reserves storage capacity on the receiving server (via the coordinator).
  Prevents out-of-space failures and enables quota enforcement.
- **Duplication**: content is replicated across designated peers for
  redundancy and data-saving (e.g., a world's core assets duplicated to
  nearby peers to reduce cross-region latency and storage cost).

### Phase 3 — Content Federation Quota

Quota enforcement for server-to-server content federation:

- **Quota definitions**: per-peer and per-server quotas for content volume
  (bytes), message count, and sync frequency.
- **Quota enforcement**: the coordinator enforces quotas during reservation
  and content push; exceeding a quota triggers backpressure, deferral, or
  rejection.
- **Quota reporting**: per-peer and aggregate quota usage available via the
  coordinator's knowledge DB and API.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Mesh Coordinator Server                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Knowledge DB │  │  Key Store   │  │  Resync Cron Engine    │ │
│  │  (servers,     │  │  (trusted    │  │  (per-peer schedules)  │ │
│  │   addresses,   │  │   keys,      │  │                        │ │
│  │   status)      │  │   capabilities)│                        │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Negotiation  │  │  Quota       │  │  Reservation Manager   │ │
│  │  Protocol     │  │  Engine      │  │  (pre-alloc storage)   │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Server A    │◄──►│  Server B    │◄──►│  Server C    │
│  (loop-lore) │    │  (loop-lore) │    │  (loop-lore) │
│              │    │              │    │              │
│  Encrypted   │    │  Encrypted   │    │  Encrypted   │
│  Content     │    │  Content     │    │  Content     │
│  + Reservation│   │  + Reservation│   │  + Reservation│
│  + Duplication│   │  + Duplication│   │  + Duplication│
│  + Quota     │    │  + Quota     │    │  + Quota     │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Phases

### Phase 1 — Mesh Coordinator Server & Knowledge DB

Design and implement the coordinator server with knowledge DB, trusted key
management, negotiation protocol, and resync cron jobs.

### Phase 2 — Encrypted Content Sharing, Reservation & Duplication

Implement encrypted content distribution: sharing, reservation, and
duplication between federated servers.

### Phase 3 — Content Federation Quota

Implement quota enforcement for server-to-server content federation.

## Dependencies

- `epic-federation-swarm-sync.md` — fediverse federation; this epic is
  server-to-server mesh, a distinct axis.
- `epic-anonymity-decentralization.md` — BYOK mesh resource sharing; this
  epic's content sharing is a different concern (encrypted content vs. compute).
- `epic-multi-instance-reconciliation.md` (Epic 26) — leader-based reconciliation;
  mesh federation is a different topology.
- `epic-certificate-and-tls-management.md` — transport TLS; this epic builds
  on it for per-peer trust.
- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` —
  per-peer CA/pinning; this epic extends it with content-level encryption.
- `epic-communications-integrations.md` — `ProtocolAdapter` / `EncryptionProvider`
  seams; content sharing reuses the encryption layer.
- `FEAT-swarm-mode-reconciliation.md` — CRDT state sync; this epic's content
  distribution complements (not replaces) CRDT reconciliation.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| --- | --- | --- |
| Certificate & TLS Management | Transport TLS, per-peer CA/pinning | Coordinator uses TLS for all peer links; keys stored in knowledge DB |
| Communications Integrations | `EncryptionProvider` seam | Content sharing encrypts with existing `EncryptionProvider` |
| Multi-Instance Reconciliation (Epic 26) | Store schema, reconciliation framing | Mesh content distribution complements leader-based reconciliation |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| --- | --- | --- |
| (none yet) | — | TBD |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| --- | --- | --- |
| Server knowledge record | Coordinator knowledge DB | Server addresses, keys, status, capabilities |
| Encrypted content envelope | `EncryptionProvider` | Content encryption in transit and at rest |
| Quota record | Coordinator quota engine | Per-peer/per-server content federation limits |
| Reservation record | Coordinator reservation manager | Pre-allocated storage on target peers |

### Cross-System Events

| Event | Direction | Purpose |
| --- | --- | --- |
| mesh.connect | emitted | Server initiates connection to a peer |
| mesh.negotiate | emitted / subscribes | Server-to-server session negotiation |
| mesh.content.push | emitted | Encrypted content pushed to a peer |
| mesh.content.reserved | emitted | Storage reservation confirmed on target peer |
| mesh.quota.check | emitted | Quota check before content push |
| mesh.resync | cron-triggered | Periodic resync per peer schedule |

## Testing Strategy

- **Coordinator**: unit tests for knowledge DB CRUD, key registration/rotation,
  negotiation protocol state machine, cron schedule evaluation.
- **Encrypted content**: integration test encrypting content on Server A,
  pushing to Server B, decrypting and verifying content integrity.
- **Reservation**: test that pushing content without reservation fails, and
  with reservation succeeds; test reservation expiry and cleanup.
- **Quota**: test that exceeding a per-peer quota triggers backpressure/deferral;
  test quota reset at window boundary.
- **Resync**: test cron-triggered resync produces consistent state across peers.
- **Interop**: test that a coordinator managing three servers correctly
  routes encrypted content, enforces quotas, and triggers resyncs.

## Security Considerations

- **Encryption**: all cross-server content MUST be encrypted end-to-end
  using the existing `EncryptionProvider`. No plaintext content crosses the
  mesh. The coordinator itself should not have access to plaintext content.
- **Key management**: peer signing keys stored encrypted at rest per the
  `epic-crypto.md` key-at-rest standard. Key rotation must be atomic and
  versioned.
- **Authentication**: every server-to-server message must be signed and
  verified. The coordinator validates peer identity before allowing any
  content push or reservation.
- **Quota abuse**: quota enforcement must not be bypassable by a compromised
  peer. The coordinator is the source of truth for quota, not the peers.
- **Resync safety**: resync jobs must not overwrite newer content with older
  versions. Use causality clocks (HLC/vector clocks) from
  `FEAT-swarm-mode-reconciliation` to detect and resolve conflicts.

## Scope Boundary

In scope:
- Mesh coordinator server design and implementation
- Knowledge DB (server addresses, trusted keys, capabilities, status)
- Negotiation protocol between federated servers
- Resync cron jobs
- Encrypted content sharing, reservation, duplication
- Content federation quota enforcement and reporting

Out of scope (owned by other epics):
- Fediverse / ActivityPub actor federation (`epic-federation-swarm-sync.md`)
- Swarm CRDT multi-writer sync (`FEAT-swarm-mode-reconciliation.md`)
- BYOK resource sharing (`epic-anonymity-decentralization.md`, Phase 4)
- Transport TLS management (`epic-certificate-and-tls-management.md`)
- Client-to-server messaging (existing loop-lore architecture)
- Contributor compute nodes (`epic-distributed-compute-sharing.md`)

## Linked Tasks

- `TASK-mesh-coordinator-server-knowledge-db` — coordinator knowledge DB,
  server addresses, trusted keys, negotiation protocol, resync cron jobs
- `TASK-mesh-encrypted-content-sharing-reservation-duplication` — encrypted
  content sharing, reservation, and duplication between federated servers
- `TASK-mesh-content-federation-quota` — content federation quota between servers
- `TASK-federation-content-clearance-gate-per-chat-consent-before-me` — per-chat explicit consent gate before mesh push (Phase 2 prerequisite; mesh membership alone never implies clearance)
- `TASK-federation-dek-re-wrap-protocol-server-to-server-key-export` — server-to-server DEK re-wrap protocol; no verbatim `chat_keys` copy to peers

## References

- `epic-federation-swarm-sync.md` — fediverse federation (distinct axis)
- `epic-anonymity-decentralization.md` — BYOK mesh (resource sharing, not content sharing)
- `epic-multi-instance-reconciliation.md` — leader-based reconciliation (Epic 26)
- `epic-certificate-and-tls-management.md` — transport TLS
- `epic-communications-integrations.md` — `ProtocolAdapter` / `EncryptionProvider` seams
- `FEAT-swarm-mode-reconciliation.md` — CRDT state sync, HLC/vector clocks
- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` — per-peer TLS trust
