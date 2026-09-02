<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Resource Provision End-to-End

**Status:** ⬜ Open
**Priority:** high
**Effort:** large
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-tests`
- `TASK-resource-provision-browser-backup`
- `TASK-resource-provision-reconciliation`
- `TASK-resource-provision-recovery`

## Summary

End-to-end round-trip: provision an external resource, route a
generation call through the resource provider, exhaust quota,
trigger a browser backup, reconcile, and recover. Validates the
full resource provision lifecycle across the stack.

## Context

Unit tests cover individual components; this ticket validates
the integrated flow from provisioning through external call,
quota enforcement, browser backup, reconciliation, and recovery.
It exercises the full stack: API routes → Kysely → crypto →
generation registry → browser IndexedDB.

## Acceptance Criteria

- [ ] E2E scenario: add an external inference endpoint (resource record)
- [ ] E2E scenario: route a generation call via the resource provider
- [ ] E2E scenario: consume quota until exhaustion; verify fallback to
  platform default
- [ ] E2E scenario: enable browser backup; export a chat to IndexedDB
- [ ] E2E scenario: trigger reconciliation; verify drift detection
  when server hash changes
- [ ] E2E scenario: recover from a drifted backup; confirm user prompt
- [ ] E2E scenario: backup rotation evicts oldest when N exceeded
- [ ] E2E scenario: quota persists across server restart (DB round-trip)
- [ ] E2E scenario: raw credential never appears in any server response
- [ ] Uses `E2E_SAFEGUARD=1` guard
- [ ] `bun run check` gate green
