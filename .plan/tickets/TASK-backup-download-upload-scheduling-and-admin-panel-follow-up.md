<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: backup download upload scheduling and admin panel follow-up

**Status:** Done
**Priority:** medium
**Effort:** Large
**Epic:** epic-database-backup-recovery.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Operator-facing DB backup download/upload, the admin panel, and opt-in scheduled snapshots with retention all ship. This ticket closes the follow-up tail.

**Evidence:** download/upload/restore at src/routes/admin/db-backup.ts:200-388; admin panel at src/components/admin/db-backup-panel.html and src/frontend/alpine/admin-db-backup.ts; the one scheduler is wired at src/cron/boot.ts:38 with opt-in `[db] backupEnabled` and `[db] snapshotRetention` from packages/core/src/config/sections/database.ts; retention runbook at docs/guide/state-and-instances.md:89.

**Scope:** define snapshot download/verified-upload endpoints behind admin.system; reuse the existing validateSqliteSnapshot guard; wire scheduling through the existing backup scheduler rather than a second timer; add an admin panel view only after the endpoints exist.

**Acceptance Criteria:**

- [x] download/upload endpoints are authenticated and path-traversal safe
- [x] scheduled backups use one scheduler
- [x] retention pruning is documented
- [x] targeted tests pass

**Context:**

Why: close the deferred operator surface without adding a second timer. Constraints: admin.system auth and traversal-safe bare names at the HTTP boundary; scheduling stays inside src/resource/backup-scheduler.ts and defaults off. Alternative considered: a dedicated cron timer, rejected because the existing event-driven scheduler already covers the triggers and retention.

**Resolved:** 2026-11-25 registry-driven close: git issue cd35549 (registry tip: 083e503b2 Konstantin Fedotov Close issue)
