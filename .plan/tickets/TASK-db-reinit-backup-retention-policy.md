<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB Reinit & Backup Retention Policy

**Status:** ✅ Resolved (already on dev, 2026-09-19)
**Priority:** medium
**Effort:** Medium
**Summary:** DB Reinit & Backup Retention Policy
**Context:** Epic epic-database-backup-recovery; tags db, backup, retention.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-database-backup-recovery
**Tags:** db, backup, retention

## Summary

Implement archive directory rotation policy, PII accumulation guard, rename-failure rollback safety per docs/spec/db-reinit-retention.md.

## Resolution

Already implemented on dev — verified 2026-09-19 docs-gap reconcile audit (epic-docs-vs-plan-gap-audit-2026-09-19.md):

- src/db/reinit-archive.ts (MAX_ARCHIVES=10/MAX_AGE_DAYS=90)
- docs/spec/db-reinit-retention.md

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
