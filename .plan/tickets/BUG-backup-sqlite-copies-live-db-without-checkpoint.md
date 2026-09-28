<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: backup-sqlite copies a live WAL database without checkpointing

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, backup, durability

**Summary:** The shipped backup path copies `loop-lore.db`, `-wal` and `-shm` with plain `copyFileSync` while the app may be writing. That is a torn snapshot, and the tar it builds omits the `-shm` file it just copied.
**Context:** Found while reviewing the DB-split epics. This is a live durability bug in the backup path, independent of any storage-splitting work - tiered storage makes it worse by adding archive DBs to the same script. `TASK-backup-consistency-vacuum-into-snapshots-plus-archive-dbs.md` already names the fix but is filed as a `medium` / epic-scoped task; this is a `high` correctness issue on the current single-DB path.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Evidence

`scripts/backup-sqlite.ts:41-56`:

- `copyFileSync(DB_PATH, BACKUP_BASE)` then `copyFileSync(walPath, ...)` and `copyFileSync(shmPath, ...)` - three independent reads of a database that another process may be committing into. SQLite's own guidance is to run `wal_checkpoint(TRUNCATE)` (or use the backup API) before copying, because the WAL can change between the copy of the main DB and the copy of the WAL.
- The `tar` argv built immediately after (`basename(BACKUP_BASE)`, `basename(BACKUP_BASE) + "-wal"`) omits `-shm`. So the copied `-shm` is never archived - dead work at best, and evidence the copy sequence was never reasoned about as a unit.
- No `PRAGMA integrity_check` or row-count assertion in the backup path itself; `scripts/validate-backup-restore.ts:72` only runs `integrity_check` on a decrypted file, which detects page corruption but not a semantically torn snapshot.

`VACUUM INTO` is available on this `bun:sqlite` build (verified), and produces a consistent single-file snapshot with no WAL sidecars - which is what the tiered-storage epic already proposes.

## Fix Shape

Replace the copy sequence with `wal_checkpoint(TRUNCATE)` + `VACUUM INTO '<dest>'`, or open the source with SQLite's online-backup API. Keep GPG-at-rest and retention as-is; change only how the bytes are obtained.

## Acceptance Criteria

- [ ] Backup no longer depends on WAL sidecar files being copied.
- [ ] A backup taken while the app is writing restores to a database that passes `integrity_check` AND matches the source row counts.
- [ ] No orphaned `-shm` copy in the archive path.
- [ ] Covered by a test that writes to the source DB during the backup.
- [ ] `bun run check` green.

## Related

- `TASK-backup-consistency-vacuum-into-snapshots-plus-archive-dbs.md` (same fix, framed as epic phase; this ticket raises it to a correctness bug)
- `TASK-BKP-001-sqlite-automated-backup.md`
- `epic-db-growth-tiered-storage.md`, `epic-database-backup-recovery.md`


git issue: 5055a30
