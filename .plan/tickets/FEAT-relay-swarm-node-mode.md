<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Relay/swarm node mode

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-federation-offload-quotas.md

**Summary:**

Operator-approved disposition (2026-11-18): Desirable / post-1.0.0. File now so the scope is recorded; do not pull this into 1.0.0.

**Summary:**

Add an opt-in federation node mode in which a loop-lore instance advertises itself, persists the federated-instance list, and reroutes work without serving normal local chat/generation. The node is a registry + advertisement + routing participant, not a general-purpose app instance.

**Current seams (verified 2026-11-18, dev):**

- Advertisement already exists: NodeInfo 2.1, host-meta/WebFinger and `/api/instance-state` with instance id, version, uptime, build hash, declared `capabilities` and gossip peers (`src/routes/federation.ts:58-188`). Opt-in via `config.federation.enabled`.
- Federated instance list already exists in four places: `config.federation.peers`/`seeds` (`packages/core/src/config/schema/federation.ts:49-66`), the `mesh_peers` table with workload columns (migration `065_mesh_peer_workload_columns.ts:8-52`), the in-memory gossip `PeerTable` bounded at 1024 entries (`src/federation/gossip.ts:32-35`), and the admin peer panel (`src/frontend/alpine/admin-federation.ts:47-60`).
- Rerouting already exists as workload offload, not general traffic relay: `resolvePeerRoute` (`src/federation/peer-router.ts:211`), `dispatchPeerWorkload` with one remote attempt and one local retry (`src/federation/peer-dispatch.ts:89`), wired into chat generation (`src/generation/generate-route/chat-peer-offload.ts:96,151`). The receiver executes locally at `/api/peer-work/run` (`src/routes/federation.ts:184-188`).

**Missing (why this is not 1.0.0):**

1. No node role in config. `FederationConfig` has no mode; `PeerInstanceKind` (`src/db/enums-federation.ts:28-34`) is an operator label, not behavior.
2. No relay capability in the closed `PeerWorkloadClass` enum (`src/db/enums-federation.ts:14-22`), so a relay cannot advertise or be selected as one.
3. No multi-hop forwarding: `/api/peer-work/run` runs locally; there is no TTL, hop count, loop detection, path header, or per-hop auth.
4. Config trust and `mesh_peers` state are not reconciled; gossip-learned peers stay `pending` while config entries become `trusted` (`src/federation/gossip.ts:12-16`; see also `epic-federation-offload-quotas.md:121-131`).
5. Enabling federation also mounts mesh content reserve/deliver and peer-work; a relay-only node needs an explicit decision on whether it stores content envelopes or only registry rows.
6. Owning epics remain future work: `epic-federation-offload-quotas.md:8` Not Started, `epic-local-process-swarm.md:9` Not Started, `epic-multi-instance-reconciliation.md:13` Not Started.

**Scope (minimal first slice):**

- Add `federation.nodeRole` with `full` (default) and `relay` (opt-in). In relay mode, skip local workload-executor registration and provider init; keep advertisement, gossip, peer registry and admin panel.
- Add a `relay` workload capability to the closed enum plus the forward migration; publish it in `/api/instance-state` and persist observed values in `mesh_peers.capabilities`.
- Make config/DB trust reconciliation explicit: one origin, one effective state; never let a gossip-learned origin gain workload trust without an admin grant.
- Add a boot/health line and runbook stating the node is relay-only, plus tests for advertisement shape, registry persistence, and refusal to execute local workloads.

**Explicitly NOT in this slice:**

- Multi-hop forwarding of `/api/peer-work/run`. That is a separate follow-up requiring TTL, loop detection, path headers and per-hop auth. Do not call a registry-only node a relay until that seam exists.
- CRDT/swarm state reconciliation, leader election, gossip-based placement, ActivityPub identity, or contributor compute nodes.
- Postgres/Docker packaging (deferred by operator directive 2026-11-16).

**Context:**

Filed from the 2026-11-18 release audit as Desirable/post-1.0.0. The current federation surface already advertises instance metadata, persists peers and supports token-gated peer-work dispatch, but every peer runs its own executor; this ticket records the operator-approved direction to separate routing from execution without pulling it into 1.0.0.

**Caveats:** TOCTOU: peer advertisement is a point-in-time claim; re-check eligibility at dispatch. Security: a relay must not trust self-reported origin or capabilities; shared token remains mandatory. Authorization: workload trust is default-false and content trust ≠ workload trust. Parallelism: gossip polls mutate the in-memory peer table; bound and dedupe as today. Lock/unlock lifecycle: n/a. Partial failure: a relay with no eligible peer must fail closed, not silently run locally. Rollback: config flag defaults to `full`; forward migration only. Stale state: config/DB trust drift is the main hazard and must be resolved explicitly. Data races: peer table updates are already bounded; keep one writer. Idempotency: resync passes must be repeatable. Observability: log the node role and route decisions; no user-facing message changes.

**Acceptance Criteria:**

- [ ] Relay mode is opt-in and the default boot path is byte-identical.
- [ ] A relay node advertises its role/capability, persists peers in `mesh_peers`, and exposes them in the admin panel.
- [ ] A relay node does not register a local workload executor and cannot execute `/api/peer-work/run` locally.
- [ ] Config trust and DB state reconcile to one effective trust decision, with default-deny for gossip-learned origins.
- [ ] Runbook, health line and tests cover the new mode.

