# TASK: PostgreSQL Backup Compatibility Layer

**Status**: open
**Priority**: medium
**Labels**: backup, postgresql, infra
**Assignee**:
**Epic**: epic-database-backup-recovery
**Related**: TASK-BKP-001-sqlite-automated-backup, TASK-BKP-002-recovery-validation

## Summary

PostgreSQL backup compatibility layer (not started). Extends the SQLite backup/recovery framework (`backup-sqlite.sh`, `validate-backup-restore.sh`) to cover the PG dialect when the app runs on Postgres.

## Acceptance

- [ ] PG backup path implemented
- [ ] Restore validation for PG
