# TASK: Backup restore reliability and self-healing for federated deployments

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Type:** Task
**Tags:** backup, restore, federation, reliability, self-healing, sqlite, snapshot
**Epic:** epic-database-backup-recovery.md (cross: epic-federation-swarm-sync.md, epic-db-asset-snapshot-recovery.md)
**Related:** TASK-BKP-001-sqlite-automated-backup.md, TASK-sqlite-backup-research.md, TASK-epic14-import-export-reconciliation.md, TASK-bulk-export-zip.md, FEAT-swarm-mode-reconciliation, FEAT-activitypub-federation

## Summary

Harden backup/restore into a self-healing subsystem, federation-aware. Findings and direction below; scope absorbed from TASK-BKP-002/003 where they overlap.

## Review findings (current state)

- `scripts/backup-sqlite.sh` / `validate-backup-restore.sh` are drafted but WAL-aware copy and network push carry TODOs; "atomic file copies" of a WAL-mode DB is not a consistent-snapshot guarantee.
- Validation cron exists but results go nowhere: no monitoring hookup, no health endpoint (TASK-BKP-003 pending), no alert on failed verify.
- Backup format is ad-hoc: raw `.db` + GPG + SHA-256 sidecar. No schema-versioned manifest; asset/world bundles (bulk-export-zip, import/export family) use a different format than DB backups — no single restore story spanning DB + assets + federated state.
- Federated state lives in the same DB (ActivityPub actors/inboxes under FEAT-activitypub-federation, swarm CRDT replicas under FEAT-swarm-mode-reconciliation, bridge outboxes). A restore from an older snapshot silently regresses federation state; no outbox-journal replay exists to re-converge.
- Two backup epics coexist (`epic-database-backup-recovery` infra scripts vs `epic-db-asset-snapshot-recovery` app-level research) with no reconciliation — this ticket is the reconciliation point for reliability/self-healing concerns.

## Direction

1. **Consistent hot backup** — replace file copies with the SQLite backup API or `VACUUM INTO` (works under WAL, transactionally consistent, Bun-compatible per `TASK-sqlite-backup-research`). Keep GPG-at-rest + checksums.
2. **Versioned snapshot manifest** — one format covering DB + asset bundles: `{schemaVersion, createdAt, db: {sha256, bytes, sqliteVersion}, assets: [...], federatedStateCursors: {outboxSeq, inboxSeq, crdtWatermarks}}`. Restore refuses unknown schema versions.
3. **Automated restore drills** — validation job restores into a scratch DB (in `.tmp/`), runs `integrity_check` plus smoke queries, records result; drill schedule distinct from backup schedule.
4. **Self-healing loop**:
   - Scheduled verify → on checksum/parse failure: quarantine artifact, auto re-run backup once, alert if still bad.
   - Live-DB watchdog: periodic `integrity_check`; on failure trigger safe checkpoint → attempt rebuild from last-known-good backup; never auto-delete live data without a fresh quarantine copy.
   - Health endpoint (completes TASK-BKP-003 scope): last backup age, last validation verdict, quarantined artifacts count.
   - Federation repair queue after restore: replay outbox journals since `federatedStateCursors` so peers re-converge instead of silently diverging.

## Acceptance Criteria

+- [ ] Hot backup uses SQLite backup API / `VACUUM INTO`; file-copy path removed or demoted to cold-path fallback.
+- [ ] Snapshot manifest implemented (schema-versioned, checksummed) and used by both backup and restore; restore rejects unknown versions.
+- [ ] Automated restore drill runs on schedule, writes verdict consumable by health endpoint; drill failure alerts.
+- [ ] Self-healing behaviors implemented: quarantine + retry on bad artifact, integrity watchdog on live DB, failover to last-known-good, federation outbox/cursor replay hook after restore.
+- [ ] Health endpoint surfaces backup freshness, last validation, quarantine state (TASK-BKP-003 scope absorbed).
+- [ ] Reconciliation note added to both backup epics pointing here as the reliability/self-healing owner.

## Verification

```bash
# Simulated corruption: flip a byte in a backup artifact, run validator
# → artifact quarantined, re-backup triggered, health endpoint shows degraded
# Restore drill against real snapshot; assert integrity_check ok + smoke queries pass
```

