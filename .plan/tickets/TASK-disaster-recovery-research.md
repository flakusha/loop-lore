# TASK: Disaster Recovery Procedure Research

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** epic-db-asset-snapshot-recovery

## Summary

Research disaster recovery procedures. Define RTO/RPO targets, backup schedules, verification scripts, and rollback procedures.

## Research Questions

1. What RTO/RPO targets are realistic for single-user/self-hosted?
2. How often should full backups run (hourly, daily)?
3. How to verify backup integrity without full restore?
4. What's the minimum viable restore procedure?
5. How to handle partial failures (DB OK, assets corrupted)?
6. Rollback procedures for failed migrations?

## Deliverable

Document in `docs/meta/disaster-recovery-procedures.md`:

- RTO/RPO targets
- Backup schedule recommendations
- Verification procedures
- Minimum viable restore

## Risk

Low — research only, no code changes.

## Related

- `src/db/migrations/` — migration patterns
- `src/reinit.ts` — DB reinitialization
