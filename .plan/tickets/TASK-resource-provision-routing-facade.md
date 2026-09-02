<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Resource Provider Routing Facade

**Status:** ⬜ Open
**Priority:** high
**Effort:** large
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-schema`
- `TASK-resource-provision-credential-store`
- `TASK-resource-provision-quota-engine`
- `src/generation/providers/registry.ts` — existing registry the facade composes with

## Summary

Build `src/generation/resource-provider.ts` — a thin facade in front
of the existing provider registry that resolves a resource record,
verifies its credential reference, enforces quota **before** the
external call, routes to the provider, and accounts for usage **after**.

## Context

The generation pipeline already owns `resolveProvider`,
`buildFailoverList`, and `callWithFailover` in
`src/generation/providers/registry.ts`. This ticket adds a
resource-provision layer **around** that registry so that calls made
via a provisioned resource carry quota enforcement and credential
verification without duplicating or replacing the existing routing
logic.

```
callWithResource(resourceId, request)
  → resolveResource(resourceId)          // fetch record, verify active
  → verifyCredential(record)             // hash/wrapped check
  → enforceQuota(resourceId, request)    // pre-call guard
  → routeToProvider(record, request)     // existing registry path
  → recordUsage(resourceId, usage)       // post-call accounting
  → onQuotaExceeded → QuotaExceededError + fallback
```

## Acceptance Criteria

- [ ] `src/generation/resource-provider.ts` exports
  `callWithResource`, `resolveResource`, `listResources`
- [ ] `callWithResource` composes with `registry.resolveProvider` /
  `buildFailoverList` / `callWithFailover` — no duplicate routing logic
- [ ] Credential reference verified before routing (hash or wrapped)
- [ ] Quota guard called **before** the external call; rejects with
  `QuotaExceededError` if any counter exhausted
- [ ] Post-call usage accounting on successful completion
- [ ] Fallback to platform default provider when resource is paused,
  revoked, or quota-exhausted
- [ ] `QuotaExceededError` is a distinct error type (not a provider
  429); carries `resourceId`, `quotaType`, `limit`, `consumed`
- [ ] Concurrency guard: reject if `concurrency` quota exceeded
  (active in-flight calls count)
- [ ] Types exported for the quota engine and UI to consume
- [ ] Unit tests: happy path, quota-exceeded rejection, fallback,
  credential verification failure, concurrency gate
- [ ] `bun run check` green
