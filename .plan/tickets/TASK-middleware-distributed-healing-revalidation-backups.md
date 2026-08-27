# TASK: Distributed healing, revalidation, backups

**Status:** ⬜ Open
**Priority:** high
**Effort:** large
**Epic:** epic-content-hashing-distributed-integrity (cross-cuts with `epic-database-backup-recovery`, `epic-multi-instance-reconciliation`, `epic-federation-swarm-sync`)
**Issue:** TBD
**Related:**
- `TASK-middleware-migration-compaction-data-version-hash.md` (provides `data_version` + `record_hash` columns + index)
- `TASK-middleware-content-assets-gallery-hashing-validation.md` (provides the validation hook)
- `src/async/store.ts` + `src/async/offload.ts` (worktree — async result store + spill daemon)
- `scripts/backup-sqlite.sh` (existing SQLite backup, GPG-encrypted)
- `scripts/validate-backup-restore.sh` (existing checksum + restore)
- `configs/cron/sqlite-backup.cron`, `sqlite-verify.cron` (existing schedules)
- `epic-database-backup-recovery.md`, `epic-multi-instance-reconciliation.md`, `epic-federation-swarm-sync.md`

## Summary

Three cross-cutting subsystems, each built on the record_hash column
(ticket 1) and content-versioning registry (ticket 3):

1. **Revalidation daemon** — periodic sweep that walks every
   content-bearing table, re-computes `record_hash`, and reports
   drift. Triggered by cron (default hourly) AND on demand
   (`POST /api/admin/revalidate`).
2. **Distributed healing** — when the daemon detects drift, it
   either:
   - **repairs** the row from a known-good source (e.g. the file
     payload's `content_hash` matches an offloaded backup), OR
   - **quarantines** the row (writes a `quarantine_log` entry and
     sets `quarantined_at` on the row; `data_version` stays a
     positive integer — see **Architectural question Q2** below).
3. **Backups** — extend the existing SQLite + GPG backup pipeline
   (TASK-BKP-001..004) with **application-aware integrity
   verification**: every backup captures the `record_hash` index
   digest (a `MIN/MAX` over the per-table index + a row count) so a
   restore can prove the schema and a sample of rows match the
   pre-backup state. The backup also captures the offload spill
   directory from `src/async/offload.ts` so async results survive a
   restore.

## Acceptance Criteria

### Revalidation daemon

- [ ] New `src/db/revalidate.ts` exports:
  - `runRevalidation(database, opts)` — sweep + report. Returns
    `{ table, scanned, drifted, repaired, quarantined }` per table.
  - `startRevalidationDaemon(database, config)` — interval-based
    runner. Default interval 1h; configurable per environment.
  - `getRevalidationReport(database, sinceIso)` — read the report
    rows (a new `revalidation_reports` table).
- [ ] New migration `0xx_revalidation_reports.ts`:

  ```sql
  CREATE TABLE revalidation_reports (
    id            TEXT PRIMARY KEY,
    started_at    TEXT NOT NULL,
    completed_at  TEXT,
    table_name    TEXT NOT NULL,
    scanned       INTEGER NOT NULL,
    drifted       INTEGER NOT NULL,
    repaired      INTEGER NOT NULL,
    quarantined   INTEGER NOT NULL,
    error         TEXT,
    triggered_by  TEXT NOT NULL  -- 'cron' | 'admin'
  );
  ```

- [ ] `startRevalidationDaemon` is **independent** of
  `startOffloadDaemon` (worktree `src/async/offload.ts`). The two
  daemons MAY share a `shouldRun` predicate factory for code reuse
  but run on independent timers. The offload daemon only handles
  `request_results` spill; the revalidation daemon sweeps every
  content-bearing table. Conflating them creates a single point
  of failure (an offload backlog would delay revalidation).
- [ ] Unit tests:
  - `runRevalidation` returns sane counts for a hand-crafted schema,
  - drift detection fires on mutated rows,
  - reports are persisted and queryable.

### Distributed healing

- [ ] New `src/db/heal.ts` exports:
  - `healRow(database, table, id)` — single-row heal. Repairs from
    the source-of-truth (file bytes for `assets`, prior
    `request_results` row for the async store, original `messages`
    row from the chat history). Returns the action taken
    (`repaired` | `quarantined` | `unrecoverable`).
  - `healTable(database, table, opts)` — bulk heal. Uses
    `MAX_CONCURRENCY` (default 4) workers; reports progress via the
    report table.
- [ ] Quarantine semantics:
  - Adds `quarantined_at TEXT` (nullable) to each content-bearing
    table via `0xx_quarantine_columns.ts`. `data_version` is NEVER
    zeroed — it remains a positive integer used by the content-
    versioning registry (ticket 3).
  - A new `quarantine_log` table records `{ row_id, table, reason,
    quarantined_at, original_record_hash, restored_at, restored_by }`.
  - `validateContentRow` (ticket 4) surfaces `QuarantinedError` on
    serve when `quarantined_at IS NOT NULL`, distinct from
    `ContentHashMismatchError`.
- [ ] Tests:
  - heal a drifted asset row from its file bytes,
  - quarantine an unrecoverable row,
  - bulk heal respects concurrency + reports progress.

### Backups (extends TASK-BKP-001)

- [ ] New `scripts/backup-integrity.ts` (Bun script, not bash — keeps
  the toolchain consistent):
  - Before the SQLite copy, run `runRevalidation` and persist the
    per-table index digests to `<backup-root>/integrity/<ts>.json`.
  - After the copy + GPG encryption, run a sample verification:
    pick N random row ids, recompute `record_hash`, compare against
    the row.
  - Also tar+copy the offload spill directory
    (`.tmp/async-store/` by default) into `<backup-root>/spills/`.
  - The integrity JSON is itself GPG-signed (separate key, content
    trust) so a restore can prove the integrity manifest matches.
- [ ] `scripts/validate-backup-restore.sh` extended to:
  - restore the SQLite file,
  - restore the spill directory,
  - re-run `runRevalidation` on the restored DB,
  - compare the post-restore digest to the pre-backup manifest,
  - exit non-zero on any mismatch.
- [ ] Cron schedules (`configs/cron/sqlite-backup.cron`,
  `sqlite-verify.cron`) extended to invoke the new scripts; the
  existing `backup-sqlite.sh` is kept as a wrapper.
- [ ] Postgres backup compatibility (`TASK-BKP-004`) extended to
  capture the same `record_hash` digests via `pg_dump --section=pre-data`
- a custom manifest. Out of scope for v1 — tracked but not
  implemented in this ticket.

## Tests

- `bun test src/db/revalidate.test.ts` — 3 cases above.
- `bun test src/db/heal.test.ts` — 3 cases above.
- `bun test scripts/backup-integrity.test.ts` (new) — full cycle:
  create a DB, back it up, mutate the live DB, restore the backup,
  verify integrity.
- `bun test src/async/offload.test.ts` — extend existing tests to
  assert the spill dir is captured by the backup.
- `bun run check` green.

## Out of Scope

- **Multi-instance reconciliation** (separate epic — depends on the
  leadership/drift detection in `epic-multi-instance-reconciliation`).
  This ticket handles single-instance healing + backups.
- **Federation healing** (separate epic — `epic-federation-swarm-sync`).
- **Application-level encryption of offload spills** (separate ticket —
  coordinate with `src/crypto/`; the body of an async response may
  carry user content).

## Notes

- **Healing is opt-in per environment.** Production runs repair;
  staging quarantines for analyst review; tests assert both paths.
- **Quarantine is reversible** — a quarantined row can be restored
  from a backup; the `quarantine_log` row records the original
  `record_hash` so the restore can prove the row matches its
  pre-quarantine state.
- The **integrity manifest** is small (one row per content-bearing
  table: `{ table, min_hash, max_hash, row_count, sample_ids }`).
  Storage cost is negligible; verification cost is O(sample size).
- The offload spill is included in the backup so async results
  survive a restore — without this, a restored DB would have rows
  in `complete` state pointing at missing spill files.
- **Backups are still encrypted at rest with GPG** (TASK-BKP-001).
  This ticket adds **integrity verification**, not encryption.

## Architectural questions (flagged for human decision)

**Q2 — Quarantine state carrier.** This ticket now uses
`quarantined_at` + `quarantine_log` (not `data_version = 0`).
Three alternatives were considered:

1. **`quarantined_at` column + `quarantine_log` table** (current
   default): preserves `data_version` semantics for the content
   registry. Cost: one nullable column per content-bearing table.
2. **Single `row_state` enum column** (`active` | `quarantined`):
   uniform, but couples all future states (deleted, archived,
   replicated) into one column.
3. **Out-of-band `quarantine_log` only**, no per-row column —
   cheapest, but every read must JOIN to check quarantine status
   (hot-path cost).

Default assumed by this ticket: option 1. Override before
implementation.
