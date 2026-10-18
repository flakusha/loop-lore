<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation peer capability advertisement

**Status:** Done
**Resolution:** Closed enum in `src/db/enums-federation.ts` (`PeerWorkloadClass`: chat, image, aux, tts, translation, embedding, vision) re-exported from the `src/db/enums.ts` barrel. `src/routes/federation.ts:116` now publishes `declaredWorkloadClasses(config)` from `config.federation.workloadOffload.classes` in place of the hardcoded `capabilities: []`, at the same `version: 1` so an older peer still parses. Observed classes stay distinguishable: `InstanceAdvertisement.capabilities` is read by `parseAdvertisedClasses()` and persisted per peer in `coordinator.ts` `touchPeer`, never folded into the declared list. Wire shape and `Version` type unchanged. Tests: `src/federation/peer-capabilities.test.ts`, `src/routes/federation.test.ts` (advertised workload capabilities describe).
**Priority:** high
**Effort:** Small
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-peer-registry-workload-columns
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Publish the workload classes a peer accepts in the instance-state
advertisement, and record the observed set on the sender.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §1. `GET /api/instance-state`
returns `capabilities: []` as a hardcoded literal
(`src/routes/federation.ts:115`) — the field exists and every consumer is
wired for it, but nothing has ever populated it. Routing cannot select a peer
for a class it has not seen advertised, so this is the wire half of the
registry slice in `TASK-federation-peer-registry-workload-columns`.

`PeerWorkloadClass` is a closed enum: `chat`, `image`, `aux`, `tts`,
`translation`, `embedding`, `vision`. Declared classes come from
`config.federation.workloadOffload`; observed classes come from the peer
advertisement and are written into `mesh_peers.capabilities` (TEXT, default
`[]` — no migration) by `touchPeer` (`src/federation/coordinator.ts:133`) on
the next `runResyncPass`.

Routing intersects the two: a class must be declared **and** advertised before
it is ever selected. A peer that advertises a class it was not configured for
is treated as not offering it.

## Acceptance Criteria

**Behaviour**

- `GET /api/instance-state` returns `capabilities` as the array of the
  configured workload classes instead of `[]`.

- An instance with no `workloadOffload` config advertises `[]`, matching
  today's wire shape exactly.

- `touchPeer` writes the advertised class list into `mesh_peers.capabilities`;
  a peer that stops advertising a class has that class removed, not retained.

**Tests**

- `src/routes/federation.test.ts` — with federation enabled and classes
  configured, the advertisement carries them; with none configured it is `[]`.

- `src/federation/coordinator.test.ts` — `touchPeer` persists and clears the
  class list.

**Edge cases**

- An unknown class string in an inbound advertisement is dropped and logged,
  never persisted and never reflected back out.

- The version field of the advertisement is unchanged, so an older peer that
  omits `capabilities` still parses.

**Concurrency / TOCTOU**

- `touchPeer` is a whole-row upsert keyed on origin; a concurrent
  `setPeerState` is not clobbered by a stale advertisement refresh.

**Security**

- The advertisement still exposes no user identifiers, counts, or secrets. The
  existing no-leak assertion
  (`src/routes/federation.test.ts:154`) is extended to cover the new values
  and must keep passing.

**Regressions**

- `src/routes/federation.test.ts`, `src/federation/coordinator.test.ts`,
  `src/federation/gossip.test.ts` green.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-peer-registry-workload-columns` (the config section and the
  class enum live with the registry slice).

## Out of Scope

- Workload execution endpoints.
- Quota agreement over `mesh_negotiations` (the `quota-agreement` state stays
  unpopulated until the quota tickets land).

**Context:** `/api/instance-state` hardcodes `capabilities: []`, so no peer has ever advertised what it accepts and routing has nothing to match on. Populates the existing field and records the observed set on the sender.
**Acceptance Criteria:** The advertisement carries the configured classes (and `[]` when none are configured); `touchPeer` persists and clears the observed set; unknown class strings are dropped and logged; the existing no-leak assertion still passes.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
