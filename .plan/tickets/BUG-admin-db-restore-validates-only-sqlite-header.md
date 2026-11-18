<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: admin DB restore validates only SQLite header

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-database-backup-recovery.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The admin restore path verifies the 16-byte SQLite magic string and then replaces the live database. A truncated or schema-less but header-valid snapshot destroys the database; the repo already has a stronger validator in its own validation script.

**Evidence (dev 2026-11-18):** hasSqliteHeader is the only check before restore (src/db/backup-restore.ts:75-85,198-200); restore closes handles, removes wal/shm and renames over the live file (:204-211); scripts/validate-backup-restore.ts:120-143 performs PRAGMA integrity_check and row-count comparison.

**Scope:** extract and call a validateSqliteSnapshot check before the pre-restore snapshot and file replacement; reject integrity_check failures and missing user tables; map to a 400 response that does not echo filesystem paths.

**Acceptance Criteria:**

- [ ] corrupt or empty-schema snapshot is rejected and the live DB stays byte-identical
- [ ] valid restore still returns restartRequired
- [ ] tests cover header-valid corrupt input

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
