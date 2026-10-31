<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quota Engine & Counter Service

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** Landed as `QuotaEngine` (`src/generation/quota-engine.ts`, `75b0d25d7`): pre-call guard + post-call accounting against `resource_quota_counters` (migration 089). Shipped scope is requests/min + tokens/min with lazy on-access window rollover — cumulative storage/compute counters and the in-flight concurrency count from the design sketch did not land (table carries only `requests`/`tokens`). Closed by registry-driven close (see Resolved footer); ACs below tick what shipped, deviations annotated inline.
**Priority:** high
**Effort:** medium
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-schema`
- `TASK-resource-provision-routing-facade`

## Summary

Implement the quota counter service: per-resource, per-window
counters that persist in the database, reset on window boundary,
and drive the `QuotaExceededError` returned by the routing facade.

## Context

Quota enforcement is the heart of the resource provision epic.
Every provisioned resource carries a ceiling (requests/min,
tokens/min, storage bytes, compute-hours, concurrency). The
quota engine must:

- Track consumption against each ceiling.
- Persist counters so they survive server restarts and sessions.
- Reset per-minute counters on the window boundary.
- Expose a gauge and a "can-call" predicate for the UI.

## Design

```typescript
interface QuotaSnapshot {
  resourceId: string;
  windowStart: Date;          // current window boundary
  requests: number;
  tokens: number;
  storageBytes: number;
  computeHours: number;
  concurrency: number;        // in-flight calls
  limits: ResourceQuota;
}
```

- Counters are persisted in `resource_quota_counters` (windowed).
- Per-minute counters reset at the top of each minute; cumulative
  counters (storage, compute-hours) persist across windows.
- A background sweeper (or on-access check) resets expired windows.
- `canCall(resourceId, request): boolean` — consumes the counter
  optimistically; reconciles on response.

## Acceptance Criteria

- [x] `src/generation/quota-engine.ts` — `consumeRequest` (pre-call guard), `recordTokenUsage` (post-call accounting), `readCounter`/`peek` (gauge seam), `hydrate`/`invalidate` (lifecycle) — the ticket's `canCall`/`recordUsage`/`getSnapshot`/`resetWindows` names did not land as such
- [x] `resource_quota_counters` table driven by the engine (migration 089; `requests` + `tokens` columns)
- [x] Per-minute windows reset automatically (lazy on-access rollover via `refreshFromDb`, persisted)
- [ ] Cumulative counters (storage bytes, compute-hours) persist across windows — NOT landed: no storage/compute columns in migration 089; requests/tokens reset per window
- [x] Guard rejects with `QuotaExceededError` (`resourceId` + `kind` + `limit`) before the external call — thrown, not a `false`+reason return as sketched
- [x] Optimistic consumption: `consumeRequest` charges one request pre-call; `recordTokenUsage` reconciles tokens post-call (never throws)
- [x] `readCounter`/`peek` returns the current quota gauge for the UI
- [ ] Concurrency tracked as in-flight count; released on response — NOT landed: in-process serialization only (promise chain); no concurrency column
- [x] Unit tests: window reset, persistence, optimistic consumption, concurrent call accounting, boundary resets (`src/generation/quota-engine.test.ts`)
- [x] `bun run check` green (per landing; registry-driven close)

**Resolved:** 2026-10-30 registry-driven close: git issue f0b8556 (registry tip: b103ce90e Konstantin Fedotov Close issue)
