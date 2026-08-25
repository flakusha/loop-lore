# TASK: DB reinit archives previous database instead of deleting

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Type:** Task
**Tags:** backup, reliability, db, reinit, data-stability
**Epic:** epic-database-backup-recovery.md
**Related:** TASK-backup-restore-reliability-and-self-healing-for-federated-de.md, TASK-sqlite-backup-research.md

## Summary

`bun db:reinit` (`src/db/reinit.ts`) currently unlinks `loop-lore.db`/`-wal`/`-shm` outright — data loss by design. Change: before reinit, archive existing DB files (move, timestamped) into a backup directory (reference: `../loop-lore-data-backup`, sibling of `DATA_DIR`; overridable via env e.g. `LOOP_LORE_BACKUP_DIR`). Cross-device rename falls back to unlink with warning. Legacy mangled-path cleanup gets the same treatment. Aligns with the quarantine-before-delete direction of `TASK-backup-restore-reliability-and-self-healing-for-federated-de`.

## Acceptance Criteria

- [ ] Before deletion, existing DB files are moved (timestamped names) into a backup directory — default sibling of `DATA_DIR` (reference: `../loop-lore-data-backup`), overridable via env (`LOOP_LORE_BACKUP_DIR`).
- [ ] Legacy mangled-path cleanup path gets the same archive treatment.
- [ ] Cross-device rename failure falls back to unlink with a logged warning; reinit never blocks on archiving.
- [ ] Smoke test: run reinit with a populated DB, assert archived files exist in the backup dir and new DB migrates + seeds cleanly.
