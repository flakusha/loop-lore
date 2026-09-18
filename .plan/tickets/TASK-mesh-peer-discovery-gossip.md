<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Mesh peer discovery and gossip transport

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🟡 In Progress — gossip loop wired (federation-mesh-core)
**Priority:** medium
**Effort:** Large
**Epic:** epic-federation-swarm-sync.md
**Related:** TASK-instance-state-advertisement-endpoint, FEAT-swarm-mode-reconciliation

## Summary

Define and implement peer discovery + gossip so mesh participants find each other
and propagate liveness/state information, reusing the swarm/gossip transport seams
already planned in the federation epic rather than inventing a new transport.

## Context

`epic-federation-swarm-sync.md` Phase D and `epic-anonymity-decentralization.md`
Phase 3 name a gossip transport for peer discovery/sync, but no ticket owns the
discovery-and-gossip slice (the existing `TASK-swarm-router-*` tickets own the
router role, not the peer gossip primitive). Peers have no way to learn of each
other or share liveness.

## Direction

1. Peer discovery: seed peers from config + the instance-state advertisement
   endpoint; maintain a peer table (peer origin, last-seen, state verdict, TTL).
2. Gossip: propagate peer state + membership over the existing transport seam
   (`ProtocolHandler`) or a documented swappable transport; evict peers on
   heartbeat timeout.
3. Replay protection and untrusted-peer handling per the federation epic security
   notes — never trust a peer's self-reported identity without signature/verdict.
4. Consume the state advertisement from
   `TASK-instance-state-advertisement-endpoint` as the gossip payload.

## Acceptance Criteria

- [ ] Seed + discovered peers converge in the peer table from config seeds.
- [ ] Heartbeat timeout evicts dead peers.
- [ ] Gossip propagates peer liveness/state without secret leakage.
- [ ] Untrusted-peer claims are not trusted (signature/verdict enforced).
- [ ] Tests cover discovery, timeout eviction, and replay rejection.
- [ ] `bun run check` green.

## Progress 2026-09-09 (federation-mesh-core)

- PeerTable primitive existed unwired (no consumers). Added `src/federation/gossip.ts`:
  GossipService pollOnce over all known peers (per-poll tick seq; stale async
  responses rejected), membership discovery from instance-state `peers` with
  canonicalization + caps (128/payload, 1024 table), verdict policy
  (config peers → trusted; seeds/gossip-learned → pending), per-peer CA-bundle
  fetch (Bun `fetch(tls:{ca})` verified against self-signed probe), per-peer
  failure isolation (one dead peer never aborts the round).
- `federation.gossip` cron job (`* * * * *`, skips when federation disabled).
- instance-state advertises `peers: string[]` (origins only, no topology).
- Tests: `src/federation/gossip.test.ts` (12 tests: verdict, eviction, replay,
  caps, trust passthrough, singleton). 41 pass across gossip + peer-table +
  federation + cron-jobs.
- Residual: SPKI-pin/mTLS enforcement (Bun fetch exposes no peer-cert handle);
  signature-based trust promotion (needs actor-key infra).
