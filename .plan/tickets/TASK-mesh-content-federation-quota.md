<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Mesh Content Federation Quota

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-mesh-federation-content-sharing

## Summary

Implement content federation quota enforcement between federated loop-lore
servers. Each peer and each server has configurable quotas for content
volume (bytes), message count, and sync frequency. The coordinator
enforces quotas during reservation and content push; exceeding a quota
triggers backpressure, deferral, or rejection.

This phase requires the mesh coordinator server
(`TASK-mesh-coordinator-server-knowledge-db`) to be complete, as it
provides the knowledge DB where quotas are stored and enforced.

## Why

Without quotas, a misbehaving or high-traffic peer can exhaust resources
on the receiving side (storage, bandwidth, compute). A server that
receives more content than it can handle becomes unavailable, breaking
the mesh for all participants. No existing epic addresses server-to-server
quota enforcement.

## Current State

- No quota mechanism exists for server-to-server content federation.
- The BYOK mesh (`epic-anonymity-decentralization.md`, Phase 4) covers
  resource sharing (compute) with a reputation/ledger system, but this
  is about incentivizing resource contribution, not enforcing content
  federation limits.
- `epic-actor-autonomy-story-drive.md` mentions "per-actor action quotas,
  per-world/chat budgets", but these are LLM actor quotas, not
  server-to-server content federation quotas.

## Acceptance Criteria

- [ ] Quota definitions: per-peer and per-server quotas for content volume
  (bytes), message count, and sync frequency. Quotas are configurable
  via the coordinator API.
- [ ] Quota enforcement: the coordinator enforces quotas during
  reservation and content push. A push that exceeds a quota is
  deferred (queued for the next window) or rejected (with a quota-exceeded
  error), depending on the quota policy.
- [ ] Quota policies: two policies per quota type —
  - **defer**: queue the content and retry when quota resets
  - **reject**: immediately reject with a quota-exceeded error
  The policy is configurable per quota type and per peer.
- [ ] Quota windows: configurable time windows (e.g., per minute, per
  hour, per day). Quotas reset at window boundaries.
- [ ] Quota reporting: per-peer and aggregate quota usage available via
  the coordinator's knowledge DB and API. Usage includes: current
  consumption, remaining quota, quota limit, and window reset time.
- [ ] Backpressure: when a peer exceeds its quota, the sending server
  receives backpressure signals (quota-exceeded errors) and adjusts
  its push rate. The sending server does not retry at full rate after
  a backpressure signal — it backs off according to the policy.
- [ ] Quota persistence: quotas survive coordinator restarts. Stored in
  the coordinator's knowledge DB.
- [ ] `bun run check` green; unit tests for quota enforcement, quota
  reset at window boundary, backpressure behavior, and reporting.

## Implementation Notes

- **Quota model**: each peer has a set of quota records, one per quota
  type (bytes, messages, sync frequency). Each record includes:
  limit, current consumption, window start, window end, policy (defer/reject).
- **Enforcement point**: quota checks happen at two points: (1) during
  reservation (the coordinator checks capacity + quota before confirming
  a reservation), and (2) during content push (the coordinator checks
  quota before accepting the content).
- **Backpressure**: when a quota is exceeded, the coordinator returns a
  structured error to the sending server. The sending server's push
  client must implement backoff (exponential or configurable) before
  retrying.
- **Quota reset**: at each window boundary, consumption resets to zero.
  Deferred content is retried at the start of the next window.
- **Reporting**: the coordinator exposes a quota usage API that returns
  per-peer and aggregate usage. Usage is a snapshot of current
  consumption within the active window.
- **Default quotas**: sensible defaults are provided (e.g., 100 MB per
  hour, 10,000 messages per hour). Administrators can override defaults
  per peer.
- **Sequence**: Phase 3 of `epic-mesh-federation-content-sharing`.
  Depends on Phase 1 (coordinator knowledge DB) being complete.

## Files

- `src/mesh-quota/` (new): `quota-engine.ts`, `quota-record.ts`,
  `backpressure.ts`, `reporting.ts`
- `src/db/migrations/` — new migration for quota records
- `src/config/sections/` — quota defaults config section
- `tests/` — unit tests for quota enforcement, window reset, backpressure,
  reporting

## Dependencies

- `epic-mesh-federation-content-sharing` (this epic)
- `TASK-mesh-coordinator-server-knowledge-db` — Phase 1 (knowledge DB,
  reservation manager)
- `TASK-mesh-encrypted-content-sharing-reservation-duplication` —
  Phase 2 (quota enforcement at reservation and push points)
