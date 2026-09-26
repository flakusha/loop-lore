<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Backup consistency: VACUUM INTO snapshots plus archive DBs

**Status:** ⬜ Not Started
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
