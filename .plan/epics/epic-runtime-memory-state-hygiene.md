<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Runtime Memory State Hygiene

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** P2
**Effort:** Medium
**Type:** Feature Epic / Hardening
**Tags:** memory, eviction, runtime, observability, review-rules
**Issue:** (none)

## Summary

Every module-level `Map`/`Set`/array that accumulates process-lifetime state keyed on
chats, users, actors, senders, or peers must have an explicit bound and an eviction
policy. Today such state is added one PR at a time with no owner: each site is found
only after it leaks (or after an adversarial input stream forges keys), fixed ad hoc,
and forgotten. This epic makes "no unbounded module state" a scoped, testable class
instead of a recurring surprise.

## Why

Precedents, all found the hard way and none covered by a common scope:

- `BUG-generation-continuation-maps-never-evicted-unbounded` (Done) — generation
  continuation maps grew monotonically.
- `BUG-rate-limit-in-memory-store-never-evicts-idle-keys` (Done) — the api-governance
  in-memory limiter kept idle keys forever.
- `BUG-module-level-in-memory-state-grows-without-eviction` (**open, member**) — three
  more sites with no TTL, cap, or cleanup; the only reset helpers are test-only.
- `BUG-per-sender-rate-limiter-buckets-are-never-evicted-unbounded-` (**open**) —
  per-sender buckets keyed on unauthenticated `From` headers; forged senders grow the
  heap and rotate past the limit. Attached to `epic-api-rate-limiting`, cross-listed
  here as the same class.

No existing epic owns "unbounded process state" as a class — the Done siblings were
each fixed inside their feature epic, leaving the next site to leak again.

## Scope

1. **Inventory**: audit `src/` for module-level mutable collections (a scripted scan for
   top-level `new Map(`/`new Set(`/`[] =` plus manual review); classify each by key
   domain (chat / user / actor / sender / peer / other) and risk.
2. **Bound + evict**: every classified site gets an explicit cap and eviction policy
   (LRU, TTL, sweep threshold — the pattern `src/integrations/bridge.ts` already uses
   `DEDUP_SWEEP_THRESHOLD` for) or a documented justification for why it is
   genuinely bounded.
3. **Leak regression tests**: per-site tests that drive past the cap with unique keys
   and assert size stays bounded (pattern: the spec already written in
   `TASK-test-debt-coordination-priority-queue-cap-regression-test`).
4. **Telemetry**: a gauge/log line per bounded site (entries, evictions) reusing
   `src/telemetry/` + the admin health-cache pattern, so drift is visible.
5. **Review rule**: document the "no unbounded module state" check in
   `.agents/references/` so review catches new sites at PR time.

## Design Notes

- Prefer the smallest correct primitive: a capped map with sweep-on-threshold; no new
  runtime dependency, no generic cache framework.
- Eviction must never break correctness silently: a swept rate-limit bucket resets the
  offender's budget — document per-site whether that is acceptable or must be
  mitigated (e.g. persist counters for security-relevant limiters).

## Tasks

- [ ] Inventory scan + classification table committed under this epic
- [ ] `BUG-module-level-in-memory-state-grows-without-eviction` — fix the three sites
- [ ] Cross-site regression test helper + per-site tests
- [ ] Telemetry gauges
- [ ] Review-rule doc in `.agents/references/`

## Acceptance Criteria

- [ ] Every module-level mutable collection in `src/` is either explicitly bounded
      with an eviction policy + test, or listed with a justification
- [ ] Driving any bounded site past its cap with unique keys leaves size ≤ cap
- [ ] Bounded sites expose entry/eviction counts via telemetry
- [ ] Review rule documented and referenced from `.agents/references/`

## Related Epics

- `epic-api-rate-limiting.md` — hosts the per-sender bucket bug (same class, feature-local fix)
- `epic-federation-swarm-sync.md` — peer-table eviction policy (`BUG-pin-mismatch…` quarantine semantics)
- `epic-llm-request-scheduler.md` — `llm/priority-queue.ts` cap/eviction behavior
- `epic-continuous-improvement.md` — sibling hardening/review-rule work

## Bind Tickets

- `BUG-module-level-in-memory-state-grows-without-eviction.md` — primary member (open)
- `BUG-per-sender-rate-limiter-buckets-are-never-evicted-unbounded-.md` — cross-listed (open, lives under api-rate-limiting)
- Reference (Done precedents): `BUG-generation-continuation-maps-never-evicted-unbounded.md`, `BUG-rate-limit-in-memory-store-never-evicts-idle-keys.md`


git issue: 23af491
