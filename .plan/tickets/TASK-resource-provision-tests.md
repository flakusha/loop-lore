<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Resource Provision Tests

**Status:** ⬜ Open
**Priority:** high
**Effort:** large
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-schema`
- `TASK-resource-provision-credential-store`
- `TASK-resource-provision-routing-facade`
- `TASK-resource-provision-quota-engine`
- `TASK-resource-provision-browser-backup`
- `TASK-resource-provision-reconciliation`
- `TASK-resource-provision-recovery`

## Summary

Unit and integration tests covering the resource provision
subsystem: routing facade, quota engine, credential store,
browser backup, reconciliation, and recovery.

## Acceptance Criteria

- [ ] Routing facade: happy path, quota-exceeded rejection,
  fallback, credential verification failure, concurrency gate
- [ ] Quota engine: window reset, cumulative persistence,
  optimistic consumption, concurrent call accounting,
  boundary resets
- [ ] Credential store: hash strategy, wrapped strategy,
  round-trip verify, raw-credential never leaves client
- [ ] Browser backup: export, hash computation, IndexedDB round-trip,
  rotation eviction, manifest integrity, quota enforcement
- [ ] Reconciliation: classification logic (consistent / drifted /
  orphaned / stale), incremental pass, drift report shape
- [ ] Recovery: preview, confirm, audit log, merge decision
  always user-confirmed
- [ ] `bun run test src/` green for all new test files
- [ ] Test helpers in `src/test-utils/` as needed
- [ ] `bun run check` gate green
