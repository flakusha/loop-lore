<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Federation interconnect peer connectivity config

**Status:** ✅ Implemented
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-swarm-sync.md
**Related:** TASK-instance-state-advertisement-endpoint, TASK-mesh-peer-discovery-gossip, TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl

## Summary

Add a `federation` (or `mesh`) config section that holds peer endpoints, seed
origins, and interconnect opt-in flags, so instances can be configured to
interconnect without hardcoded addresses.

## Context

Federation/mesh tickets assume a place to declare peers, seeds, and the opt-in to
interconnect. No such config exists (`federation` returns no config-section hits).
`TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` already
assumes a per-peer trust store; this ticket owns the peer-list + opt-in surface
that trust store attaches to.

## Direction

1. New `federation` config section: `enabled` (default false), `seeds: string[]`
   (peer origins to bootstrap from), optional `peers` with per-peer origin +
   trust overrides (CA bundle / SPKI pin) consumed by the TLS peer-trust ticket.
2. Follow the schema/section/meta/defaults triple pattern (see
   `src/config/sections/server.ts`); barrel-export + register in the orchestrator.
3. All interconnect disabled by default — an instance must explicitly opt in and
   list seeds before it advertises or connects.

## Acceptance Criteria

- [ ] `federation` config section added with `enabled` + `seeds` + per-peer trust.
- [ ] Defaults: disabled, empty seeds, empty peers.
- [ ] Per-peer trust overrides (CA/SPKI) shape defined for the TLS peer-trust ticket.
- [ ] Config load tests cover defaults + override + disabled-by-default gating.
- [ ] `bun run check` green.
