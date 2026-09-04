<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Runtime Integrity Watchdog & Crash Recovery

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-runtime-integrity-fail-safes

## Summary

Implement runtime integrity monitoring and crash recovery for the
local loop-lore instance. A scheduled in-app watchdog verifies database
and content integrity during execution. On startup after an unclean
shutdown, the instance verifies integrity before serving requests and
enters safe recovery mode if corruption is detected. In-flight write
operations are tracked so partial writes can be reconciled after a crash.

## Why

The graceful shutdown handler (`src/server/start.ts:180`) stops servers
and flushes the logger but does **not** wait for in-flight database
operations to complete. The hard-exit guard (`src/server/start.ts:175`)
kills subprocesses without data preservation. After a crash, the instance
restarts with whatever state SQLite WAL replayed, with no verification
that the replayed state is consistent. Corruption is only detected during
scheduled revalidation or backup verification, which may be hours late.

## Current State

- `src/db/index.ts` enables `PRAGMA journal_mode = WAL` and
  `PRAGMA foreign_keys = ON` at startup. No runtime integrity checks.
- `src/server/start.ts` has graceful shutdown but no data integrity
  guarantees during shutdown or crash.
- `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md`
  defines data-level checksums and an integrity ledger, but the
  integrity ledger is not yet implemented.
- `epic-content-hashing-distributed-integrity.md` defines canonical
  record hashes, but the revalidation daemon is not yet implemented.
- No crash recovery mechanism exists.

## Acceptance Criteria

### Runtime Integrity Watchdog

- [ ] Scheduled in-app process runs `PRAGMA integrity_check` and
  application-level checksums on live data at configurable intervals.
- [ ] Watchdog verdicts (pass, warn, fail) are surfaced to the health
  endpoint.
- [ ] On integrity failure, the watchdog quarantines affected data
  and publishes a corruption verdict. Quarantine never auto-deletes
  live data.
- [ ] Watchdog is bounded by schedule and timeout to prevent DoS
  (no infinite integrity checks).
- [ ] Watchdog reuses the integrity ledger from
  `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md`
  and record hashes from `epic-content-hashing-distributed-integrity.md`.

### Crash Recovery on Startup

- [ ] After an unclean shutdown (crash, SIGKILL, OOM), the instance
  detects the unclean state before serving requests.
- [ ] On detection of unclean shutdown, the instance runs a full
  integrity check before accepting any requests.
- [ ] If integrity check passes, the instance resumes normal operation.
- [ ] If integrity check fails, the instance enters **safe mode**
  (read-only, rejects writes) and logs the corruption.
- [ ] Unsafe shutdown is detected via a sentinel file or SQLite
  wal_checkpoint state — not by timestamp alone.
- [ ] Recovery from safe mode requires manual operator acknowledgment
  or automated repair from last-known-good backup.

### In-Flight Operation Tracking

- [ ] Active write operations are tracked (operation type, table,
  primary key, started-at, status).
- [ ] After a crash, the instance identifies partial writes from the
  tracking state and reconciles them (rollback or complete).
- [ ] Tracking state is durable (survives crash) so partial writes
  can be identified post-crash.

### `bun run check` green; unit and integration tests for watchdog,

crash detection, and recovery.

## Implementation Notes

- **Watchdog**: use a lightweight scheduler (e.g., `bun-cron` or
  native timer). Configurable interval (default: 5 minutes).
  Integrity checks are bounded by a timeout (default: 30 seconds).
  If a check exceeds the timeout, the watchdog reports a timeout
  verdict and retries on the next schedule.
- **Integrity check**: use `PRAGMA integrity_check` for SQLite-level
  integrity. Add application-level checksums using the integrity
  ledger from `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md`.
- **Crash detection**: write a sentinel file (e.g., `.integrity-running`)
  on startup and delete it on clean shutdown. If the sentinel file
  exists on startup, the instance detected an unclean shutdown.
  Alternatively, use SQLite WAL state.
- **Safe mode**: when safe mode is active, all write endpoints return
  503 Service Unavailable. Read endpoints continue to serve data.
  Safe mode is cleared after integrity is restored and an operator
  acknowledges the recovery.
- **In-flight tracking**: maintain a lightweight in-memory map of
  active operations, persisted to a durable store (e.g., a dedicated
  table or file) so it survives crashes.
- **Health endpoint**: extend the existing health endpoint with
  integrity verdicts, crash state, and safe mode status.
- **Sequence**: Phase 1 of `epic-runtime-integrity-fail-safes`.
  Must complete before Phase 2 (fail-safe execution).

## Files

- `src/integrity/` (new): `watchdog.ts`, `crash-recovery.ts`,
  `in-flight-tracking.ts`, `safe-mode.ts`, `health.ts`
- `src/db/integrity-ledger.ts` — integrity ledger table (from
  `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md`)
- `src/db/migrations/` — new migration for integrity ledger and
  sentinel tracking
- `src/config/sections/` — integrity watchdog config section
- `tests/` — unit tests for watchdog, crash detection, recovery;
  integration tests for safe mode and in-flight tracking

## Dependencies

- `epic-runtime-integrity-fail-safes` (this epic)
- `epic-data-integrity-acid.md` — `format_version` (Phase 2 builds on this)
- `epic-content-hashing-distributed-integrity.md` — record hashes
- `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md` — integrity ledger, checksums
- `TASK-backup-restore-reliability-and-self-healing-for-federated-de.md` — repair from backup
- `src/server/start.ts` — graceful shutdown, hard-exit guard, signal handling
- `src/db/index.ts` — SQLite WAL + FK pragmas
