<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: User-Confirmed Recovery & Backup Rotation

**Status:** ⬜ Open
**Priority:** high
**Effort:** large
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-reconciliation`
- `TASK-resource-provision-browser-backup`

## Summary

Implement the recovery flow: on drift detection or user request,
restore from a browser backup into the active dataset. Every merge
decision is user-confirmed — never silent. Backup rotation (keep N
most recent per resource) is enforced alongside recovery.

## Context

Recovery from a browser backup is inherently a merge operation:
the backup blob may differ from the current active state. The epic
requires that every overwrite / merge / create decision is explicit
and confirmed by the user. This ticket also handles backup rotation
so that stale backups are pruned while recent ones are retained.

## Acceptance Criteria

- [ ] `src/backup/recovery.ts` — `recover(backupId)`,
  `previewRecovery(backupId)`, `confirmRecovery(backupId)`
- [ ] `previewRecovery` returns a diff summary (what will change)
  before the user confirms
- [ ] `confirmRecovery` applies the restore and creates a
  `backup_records` entry marking the recovery source
- [ ] Recovery is user-confirmed per item — never silent
- [ ] On drift, offer three options: restore-from-backup,
  overwrite-local-with-server, dismiss
- [ ] On orphaned, offer: push (create on server), dismiss
- [ ] On stale, offer: pull (update local), dismiss
- [ ] Backup rotation: keep N most recent per resource type
  (default 10); configurable in settings
- [ ] Rotation runs after every export and on manual cleanup
- [ ] Recovery audit log: each recovery records the backup ID,
  timestamp, and items restored
- [ ] `bun run check` green
