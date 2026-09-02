<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Hashing-Based Reconciliation & Drift Detection

**Status:** ⬜ Open
**Priority:** high
**Effort:** large
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-browser-backup`
- `TASK-resource-provision-recovery`
- `epic-content-hashing-distributed-integrity.md` — canonical
  record hash + `X-Record-Hash` used as the server-side anchor

## Summary

Implement background hash reconciliation: on reload and on
explicit trigger, compare every browser backup's content hash
against the canonical server-side record hash, classify each
item as consistent / drifted / orphaned / stale, and surface a
user-facing drift report.

## Context

Browser backups are only useful if their integrity is verifiable.
Reconciliation anchors local hashes to the canonical server-side
record hash (`X-Record-Hash` from `epic-content-hashing-distributed-integrity.md`),
so any mutation — whether by the user, the server, federation sync,
or an offload daemon — is detected. Reconciliation is background and
non-blocking; the report is surfaced in the backup dashboard.

## States

| State | Condition | Meaning |
| --- | --- | --- |
| `consistent` | local hash == server hash | no action |
| `drifted` | local hash != server hash | local and server both exist; content diverged |
| `orphaned` | local hash has no server counterpart | backup was created but source row gone |
| `stale` | local version < server version | server is newer; local is behind |

## Acceptance Criteria

- [ ] `src/backup/reconciliation.ts` — `reconcile(ownerId?)`,
  `getDriftReport`
- [ ] On app reload, reconcile all backup records against the
  server-side `X-Record-Hash` (where available)
- [ ] Classify each backup item into `consistent` / `drifted` /
  `orphaned` / `stale`
- [ ] `getDriftReport` returns grouped counts + per-item detail
  (id, type, state, localHash, serverHash)
- [ ] Reconciliation is background and non-blocking; a loading
  indicator is shown until the first pass completes
- [ ] Drift detection uses SHA-256 content hashes (not timestamps)
- [ ] `consistent` items are skipped on subsequent passes
  (incremental reconciliation)
- [ ] Dashboard UI: summary cards (consistent / drifted / orphaned
  / stale) + per-item detail table
- [ ] Manual "Verify Now" button triggers a full reconciliation pass
- [ ] Reconciliation results feed the recovery flow
  (`TASK-resource-provision-recovery`)
- [ ] Unit tests: classification logic, incremental pass,
  drift report shape, hash comparison
- [ ] `bun run check` green
