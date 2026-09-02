<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quota Engine & Counter Service

**Status:** ⬜ Open
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

- [ ] `src/generation/quota-engine.ts` — `canCall`, `recordUsage`,
  `getSnapshot`, `resetWindows`
- [ ] `resource_quota_counters` table driven by the engine
- [ ] Per-minute windows reset automatically (sweeper or on-access)
- [ ] Cumulative counters (storage bytes, compute-hours) persist
  across windows
- [ ] `canCall` returns `false` with a reason string when any
  ceiling is exhausted
- [ ] Optimistic consumption: counter decremented at call start,
  reconciled on response (success/failure)
- [ ] `getSnapshot` returns the current quota gauge for the UI
- [ ] Concurrency tracked as in-flight count; released on response
- [ ] Unit tests: window reset, cumulative persistence, optimistic
  consumption, concurrent call accounting, boundary resets
- [ ] `bun run check` green
