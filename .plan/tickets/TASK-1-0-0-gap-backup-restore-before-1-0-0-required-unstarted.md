<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 GAP: backup/restore before 1.0.0 (required, unstarted)

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Required claims data resilience but epic-database-backup-recovery.md and epic-db-asset-snapshot-recovery.md are both Not Started -- the biggest Required-vs-plan mismatch. Scope: minimal backup/restore slice shippable for 1.0.0. Related: epic-database-backup-recovery.md, epic-db-asset-snapshot-recovery.md. Caveats: TOCTOU: backup is a point-in-time snapshot; concurrent writes after snapshot excluded and noted. Security: backups inherit at-rest encryption; restore validates integrity before applying. Authorization: backup/restore gated to operator role. Parallelism: single backup/restore flow; concurrent runs serialized. Partial failure: failed restore leaves live data untouched. Rollback: restore is itself the rollback path; pre-restore snapshot taken. Observability: backup/restore runs logged with outcome.

**Context:**

(see Implementation note below)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated

**Implementation note (2026-11-12, worktree `backup-restore`):**

Landed: `src/db/backup-restore.ts` (service: `createDbBackup` via SQLite `VACUUM INTO` under SQLite's own write locking; `listDbBackups` with name/size/mtime; `hasSqliteHeader` magic-byte validation; `resolveBackupPath` traversal guard; `restoreDbBackup`) and `src/routes/admin/db-backup.ts` (admin-gated `GET/POST /api/admin/db/backup`, `POST /api/admin/db/restore` with `RESTORE` confirmation), registered in `src/routes/admin/index.ts`. Backup dir reuses the reinit archive root convention (`LOOP_LORE_BACKUP_DIR` / data-dir sibling) under a `db/` subtree; live path mirrors the singleton resolution (`LOOP_LORE_DB_PATH` / data-dir default). Service unit tests in `src/db/backup-restore.test.ts` (real bun:sqlite temp dbs: snapshot opens with expected tables/rows and is independent of later writes; header check rejects text/truncated/missing files; restore replaces the live file after close and leaves a pre-restore rollback snapshot).

Restore design decision: true in-place restore is unsafe in-process. Routes and services capture the Kysely `Db` handle at registration (closing the singleton would strand live references to a destroyed connection), and replacing the file under an open connection leaves that connection writing to the unlinked inode. Chosen sequence: snapshot the current live db (rollback path) -> validate the target (SQLite magic header) -> close the live handles (`resetDatabaseSingleton`, checkpoints/flushes) -> remove stale `-wal`/`-shm` sidecars -> atomically rename the snapshot over the live path. Consequence (explicit limitation, surfaced as `restartRequired: true` in the restore response): previously captured handles are dead and the process must be restarted to serve the restored database. Pre-restore snapshot kept as the rollback path. Failed restores before the final rename leave live data untouched.

Remaining: operator-facing docs/changelog entry; optional future work — restore-download/verified-upload over HTTP, scheduled (cron) backups, retention pruning for db snapshots (reinit archives already have retention), and a frontend admin panel.
