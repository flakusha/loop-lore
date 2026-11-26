<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Backup consistency: VACUUM INTO snapshots plus archive DBs

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, backup

**Summary:** Replace raw file-copy backup with VACUUM INTO consistent snapshots (no WAL dependence); --archive flag covers archive DBs; fully checkpoint WAL before copy; extend validate-backup-restore.ts with row-count verification.

**Context:** scripts/backup-sqlite.ts copies DB + WAL + SHM sidecars without checkpointing and covers only the single hot DB; archive DBs from the tiered-storage phases need consistent snapshotting in the same chain.

**Acceptance Criteria:**

- [ ] Backup produces consistent snapshots without needing WAL files; archive DBs included.
- [ ] validate-backup-restore.ts checks row counts, not just page integrity.
- [ ] `bun run check` green.

---

## Resolution (2026-11-27, verified on dev)

All implementable ACs ship: `scripts/backup-sqlite.ts` snapshots via `VACUUM INTO` (no WAL sidecars); `scripts/validate-backup-restore.ts` runs `compareRowCounts` (Step 4) — missing tables and surplus rows fail validation, which `integrity_check` alone cannot see; `scripts/backup-sqlite.test.ts` covers idle restore, backup-during-writes, and row-count mismatches (7/7); service/route/scheduler suites 41/41; full `bun run check` green on dev.
Exception: the `--archive` flag has no target — the tiered-storage epic never landed archive DBs on dev (only reinit archives, a different concept). If archive DBs appear, they need a snapshot entry point in the same chain.

**Resolved:** 2026-11-26 registry-driven close: git issue f91f01e (registry tip: 3df1511d7 Konstantin Fedotov Close issue)
