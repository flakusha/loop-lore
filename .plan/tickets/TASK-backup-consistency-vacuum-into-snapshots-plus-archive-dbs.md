<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Backup consistency: VACUUM INTO snapshots plus archive DBs

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, backup

## Summary

Replace raw file-copy backup with VACUUM INTO consistent snapshots (no WAL dependence); --archive flag covers archive DBs; fully checkpoint WAL before copy; extend validate-backup-restore.ts with row-count verification. Acceptance: backup needs no WAL files; archive DBs included; row counts verified; check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
