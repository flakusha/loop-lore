<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Instance state advertisement endpoint (mesh/federation)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-swarm-sync.md
**Related:** TASK-nodeinfo-well-known-discovery-endpoints, TASK-federation-peer-connectivity-config, TASK-mesh-peer-discovery-gossip

## Summary

Add an opt-in instance-state endpoint that advertises this server's identity,
software version, capabilities, and health verdict to peers so a mesh/federation
node can be discovered and contacted.

## Context

Peers need a machine-readable way to learn "who is this instance, what version,
what protocols, what state" before establishing links. Today there is no such
surface: the transport epic advertises protocol capabilities via
`src/transport/negotiation.ts` (`DEFAULT_CAPABILITIES`) but that is connection-level,
not instance-level, and `epic-anonymity-decentralization.md` names `advertiseMdns`
without an HTTP counterpart.

## Direction

1. Define a versioned instance-state payload: instance ID (stable, not a secret),
   software name/version, supported protocols/capabilities (reuse transport
   capability list where it fits), uptime, and a coarse state (ok/degraded/down
   from `src/admin/provider-health.ts`).
2. Expose at a well-known path (e.g. `/api/instance-state` or `/instance/state`)
   gated by the federation/mesh opt-in — not public by default.
3. Never expose secrets, API keys, user counts, or internal addresses; the
   payload is for peer bootstrap only.

## Acceptance Criteria

- [ ] Endpoint returns versioned instance-state JSON when opted in.
- [ ] Includes stable instance ID, version, protocols, uptime, coarse state.
- [ ] Gated behind federation/mesh opt-in; unmounted otherwise.
- [ ] No secret/identifier leakage in the payload.
- [ ] Tests cover shape + gating + state mapping.
- [ ] `bun run check` green.
