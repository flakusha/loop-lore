<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: backup download upload scheduling and admin panel follow-up

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-database-backup-recovery.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Database backup and restore are shipped, but the operator-facing HTTP download/upload, scheduled snapshots, retention pruning and frontend admin panel are deferred. Track them as one follow-up slice.

**Evidence (dev 2026-11-18):** TASK-1-0-0-gap-backup-restore-before-1-0-0-required-unstarted.md:7,32 records the deferral; report .tmp/intercom/plan-wave/15-backup-mobile.md D2/D3; snapshot and restore backend at src/db/backup-restore.ts:99-214 is already green.

**Scope:** define snapshot download/verified-upload endpoints behind admin.system; reuse the existing validateSqliteSnapshot guard; wire scheduling through the existing backup scheduler rather than a second timer; add an admin panel view only after the endpoints exist.

**Acceptance Criteria:**

- [ ] download/upload endpoints are authenticated and path-traversal safe
- [ ] scheduled backups use one scheduler
- [ ] retention pruning is documented
- [ ] targeted tests pass

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
