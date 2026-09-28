<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: backup-sqlite copies a live WAL database without checkpointing

**Status:** In Progress
**Priority:** high
**Effort:** Small
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, backup, durability

**Summary:** The shipped backup path copies `loop-lore.db`, `-wal` and `-shm` with plain `copyFileSync` while the app may be writing. If a checkpoint lands between the two copies the backup is missing data that was committed - reproduced deterministically as a restore with no schema at all - and the tar it builds omits the `-shm` file it just copied.
**Context:** Found while reviewing the DB-split epics. This is a live durability bug in the backup path, independent of any storage-splitting work - tiered storage makes it worse by adding archive DBs to the same script. `TASK-backup-consistency-vacuum-into-snapshots-plus-archive-dbs.md` already names the fix but is filed as a `medium` / epic-scoped task; this is a `high` correctness issue on the current single-DB path.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Evidence

`scripts/backup-sqlite.ts:41-56`:

- `copyFileSync(DB_PATH, BACKUP_BASE)` then `copyFileSync(walPath, ...)` and `copyFileSync(shmPath, ...)` - three independent reads of a database that another process may be committing into.
- The `tar` argv built immediately after (`basename(BACKUP_BASE)`, `basename(BACKUP_BASE) + "-wal"`) omits `-shm`. So the copied `-shm` is never archived - dead work at best, and evidence the copy sequence was never reasoned about as a unit.
- No row-count assertion in the backup path. `scripts/validate-backup-restore.ts:72` runs `PRAGMA integrity_check` on the decrypted file; that verifies page-level structure only, so a backup that is missing whole tables or rows still passes it. The reproduction below produces exactly that: a restore where the table is simply not there to query.

### Reproduction (2026-09-28)

The failure is specifically **a checkpoint landing between the two copies**, not concurrent writes. Concurrent writes are the SAFE direction: a main file older than its WAL replays forward. The unsafe direction is:

1. `copyFileSync(db)` - main file at state M
2. the app runs a checkpoint - WAL frames are folded into the main file and **the WAL is reset**
3. `copyFileSync(db-wal)` - the NEW, reset WAL, which no longer contains the folded frames

Result: frames that lived only in the pre-reset WAL exist in neither copy. Observed on this `bun:sqlite` build (bun 1.4.2):

- `PRAGMA wal_checkpoint(TRUNCATE)` between the copies: **6/6 trials produced a backup where the table did not exist** (`SQLiteError: no such table: t`). Deterministic.
- `PRAGMA wal_checkpoint(PASSIVE)` between the copies: 6/6 trials recovered all rows. Timing-dependent, not safe.
- Partial-checkpoint pressure (large rows + a concurrent reader holding a read txn, forcing `RESTART` to stop partway) did not lose rows in 40 trials - so row loss is real but harder to hit than schema loss.

So the worst case is a backup that restores to a database **missing the schema**, not merely stale rows - and `integrity_check` will not flag it.

## Fix Shape

Do NOT add `wal_checkpoint(TRUNCATE)` before the copy - that is the operation that produces the failure above. Use `VACUUM INTO '<dest>'` (verified working on this build) or SQLite's online-backup API, both of which produce a consistent single-file snapshot with no WAL sidecars - which is what the tiered-storage epic already proposes. Keep GPG-at-rest and retention as-is; change only how the bytes are obtained.

## Acceptance Criteria

- [x] Backup no longer depends on WAL sidecar files being copied.
- [ ] A backup taken while the app is writing restores to a database that passes `integrity_check` AND matches the source row counts.
- [x] No orphaned `-shm` copy in the archive path.
- [ ] Covered by a test that writes to the source DB during the backup.
- [x] `bun run check` green.

## Partial fix landed 2026-09-29 — NOT closed

The code fix is on `dev` and the first and third criteria are met, verified by
reading the shipped source rather than by trusting the commit subject:

- `35c002570 fix(db): cascade memory embeddings and snapshot backups via VACUUM INTO`
- `ac7f7dedc fix(scripts): remove a partial snapshot when VACUUM INTO fails`

`scripts/backup-sqlite.ts:56` now runs `VACUUM INTO '<dest>'` inside a `try`, and
the comment at :42-48 explicitly names this ticket as the reason `copyFileSync`
must not be reinstated. The `copyFileSync(DB_PATH, ...)` + `-wal` + `-shm` sequence
described in Evidence is gone, and the `tar` argv no longer carries sidecars, so
criteria 1 and 3 hold. The `ac7f7dedc` follow-up also closes the truncated-file
hazard: a failed `VACUUM INTO` now unlinks its partial output rather than leaving
a `backup_`-prefixed file for the retention sweep to pick up.

Two criteria remain genuinely unmet, so this stays open:

- **No test covers the backup path at all.** `scripts/scripts.test.ts` has zero
  occurrences of `backup`; there is no `scripts/backup-sqlite.test.ts`. The
  second and fourth criteria are both unverified, and the original reproduction
  in this ticket was manual.
- **The row-count assertion is still missing.** `scripts/validate-backup-restore.ts`
  runs `PRAGMA integrity_check` only, which is exactly the gap Evidence called out:
  a backup missing whole tables passes it.

The `TASK-backup-consistency-vacuum-into-snapshots-plus-archive-dbs.md` epic-phase
ticket remains the right home for the row-count + archive-DB work. This ticket
should close once a concurrent-write backup test exists.

## Related

- `TASK-backup-consistency-vacuum-into-snapshots-plus-archive-dbs.md` (same fix, framed as epic phase; this ticket raises it to a correctness bug)
- `TASK-BKP-001-sqlite-automated-backup.md`
- `epic-db-growth-tiered-storage.md`, `epic-database-backup-recovery.md`


git issue: 5055a30
