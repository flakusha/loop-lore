<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Runtime Integrity, Crash Recovery & Fail-Safes

**Status**: 🟡 Draft — analysis complete, tickets scoped
**Priority**: high
**Effort**: Very High
**Type**: Architecture / Reliability Epic
**Tags**: integrity, crash-recovery, fail-safe, runtime, local-instance, work-safety
**Assignee**:

## Summary

Ensure data integrity, execution safety, and fail-safe operation for loop-lore
running on a local instance — during application execution, not just at rest or
during backup. Covers runtime integrity monitoring, crash recovery from partial
writes, fail-safe execution patterns (atomic operations, shutdown data safety,
subprocess preservation), and a holistic local-instance integrity posture.

This epic fills a gap between the database-level guarantees of `epic-data-integrity-acid.md`
(Epic 27), the content-level hashing of `epic-content-hashing-distributed-integrity.md`,
and the disaster-level backup/recovery of `epic-database-backup-recovery.md`. Those
epics operate on data at rest; this epic operates on data **during execution**.

## Motivation

loop-lore currently has three integrity layers that are all **offline** or
**batch**:

1. **Database ACID** (`epic-data-integrity-acid.md`, Epic 27) — SQLite WAL +
   `format_version` optimistic concurrency. These protect individual
   transactions but do **not** protect in-flight operations during crashes,
   signals, or shutdown.

2. **Content hashing** (`epic-content-hashing-distributed-integrity.md`) —
   canonical record hashes, content versioning, revalidation daemon. These
   detect corruption after it happens but do **not** prevent it during
   execution.

3. **Backup & recovery** (`epic-database-backup-recovery.md`) — scheduled
   backups, restore drills, self-healing. These recover from disasters but
   do **not** prevent data loss during runtime failures.

**None of these protect data during the application run itself.** Specifically:

- The graceful shutdown handler (`src/server/start.ts:180`) stops servers and
  flushes the logger but does **not** wait for in-flight database operations to
  complete, does **not** take a consistent checkpoint, and does **not** ensure
  that partial writes are rolled back before exit.
- The hard-exit guard (`src/server/start.ts:175`) kills subprocesses
  (`serverManager.killAllSync()`) without data preservation — in-flight
  generation tasks and external inference servers are terminated abruptly.
- `format_version` optimistic concurrency is required in the schema but its
  write-path enforcement is incomplete — some mutation routes skip the
  version check, leaving stale-write windows.
- No application-level integrity watchdog exists during runtime — corruption
  is only detected during scheduled revalidation or backup verification,
  which may be hours late.
- No crash recovery mechanism exists — after a crash, the instance restarts
  with whatever state the SQLite WAL replayed, with no verification that the
  replayed state is consistent.

## Current State Assessment

### What exists

| Area | File(s) | State |
| --- | --- | --- |
| Backend selection guards | `epic-data-integrity-acid.md` Phase 1 | ✅ Complete |
| `format_version` columns | `src/db/schema-*.ts` | ✅ Present on core tables |
| `format_version` write-path enforcement | route handlers | ❌ Incomplete — some routes skip it |
| SQLite WAL + FK pragmas | `src/db/index.ts` | ✅ Runtime |
| Graceful shutdown | `src/server/start.ts:180-194` | ⚠️ No data integrity guarantee |
| Hard-exit guard | `src/server/start.ts:175-177` | ⚠️ Kills subprocesses without preservation |
| Signal handling | `src/server/start.ts:196-220` | ⚠️ Calls shutdown without data safety |
| Transaction usage | `src/routes/` (inconsistent) | ⚠️ Some routes use `database.transaction()`, others don't |
| Backup scripts | `scripts/backup-sqlite.sh` | Drafted (TODOs) |
| Content hashing | `epic-content-hashing-distributed-integrity.md` | Not Started |
| Data-level integrity | `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md` | Not Started |
| Backup restore reliability | `TASK-backup-restore-reliability-and-self-healing-for-federated-de.md` | Not Started |

### Uncovered gaps (this epic)

- Runtime integrity monitoring during application execution
- Crash recovery from partial writes
- Fail-safe execution (atomic operations, shutdown data safety, subprocess preservation)
- Shutdown data safety (ensuring in-flight operations complete before exit)
- Local-instance holistic integrity posture

## Scope (this epic adds)

### Phase 1 — Runtime Integrity & Crash Recovery

Mechanisms to detect, prevent, and recover from data integrity failures **during
application execution**:

- **Runtime integrity watchdog**: a scheduled in-app process that runs
  `PRAGMA integrity_check` and application-level checksums on live data,
  surfacing verdicts to the health endpoint. Catches corruption between
  backup cycles.
- **Crash recovery on startup**: after an unclean shutdown (crash, SIGKILL,
  OOM), the instance verifies database integrity before serving requests.
  If corruption is detected, it enters a safe recovery mode rather than
  serving potentially corrupted data.
- **In-flight operation tracking**: track active write operations so that
  after a crash, the instance can identify and reconcile partial writes.

### Phase 2 — Fail-Safe Execution & Work Safety

Mechanisms to ensure data integrity **during the execution of business logic**:

- **Atomic operation framework**: a library ensuring that complex multi-step
  business logic (e.g., trade execution, scene transitions, multi-table
  mutations) either completes entirely or rolls back — no partial state.
  Extends the existing `database.transaction()` pattern to all write paths.
- **Shutdown data safety**: the graceful shutdown handler waits for all in-flight
  database operations to complete (or roll back) before stopping servers.
  No data is lost because the server stopped mid-write.
- **Subprocess data preservation**: the hard-exit guard drains in-flight work
  from subprocesses before killing them. External inference servers and workers
  complete or checkpoint their current work before termination.
- **Signal-safe mutation**: ensure that SIGTERM/SIGINT/SIGHUP cannot interrupt
  a database mutation mid-way. Signals are deferred until the current operation
  completes, or the operation is rolled back on signal receipt.

### Phase 3 — Local Instance Data Integrity (Holistic)

Integrate all mechanisms into a unified local-instance integrity posture:

- **Integrity health endpoint**: unified view of runtime integrity status,
  crash recovery status, atomic operation health, and fail-safe status.
- **Integrity reporting**: periodic integrity reports (daily or on-demand)
  covering all layers: database, content, runtime, and fail-safe.
- **Safe mode**: when integrity is compromised, the instance enters a safe
  mode that serves read-only data and rejects writes until integrity is restored.
- **Documentation**: authoritative integrity playbook for the local instance.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Local Instance                               │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Application Runtime                       │ │
│  │                                                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │ │
│  │  │  Integrity    │  │  Crash       │  │  Shutdown        │ │ │
│  │  │  Watchdog     │  │  Recovery    │  │  Data Safety     │ │ │
│  │  │              │  │  (on startup)│  │  (on shutdown)   │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │ │
│  │                                                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │ │
│  │  │  Atomic       │  │  Signal-     │  │  Subprocess      │ │ │
│  │  │  Operation    │  │  Safe        │  │  Preservation    │ │ │
│  │  │  Framework    │  │  Mutation    │  │                  │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Data Layer                               │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │ │
│  │  │  SQLite WAL   │  │  format_version│ │  Content         │ │ │
│  │  │  + FK pragmas │  │  enforcement │  │  Hashing         │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Health & Reporting                       │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │ │
│  │  │  Integrity    │  │  Safe Mode   │  │  Integrity       │ │ │
│  │  │  Health       │  │  (read-only) │  │  Reports         │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Phases

### Phase 1 — Runtime Integrity & Crash Recovery

Runtime integrity watchdog, crash recovery on startup, in-flight operation tracking.

### Phase 2 — Fail-Safe Execution & Work Safety

Atomic operation framework, shutdown data safety, subprocess preservation, signal-safe mutation.

### Phase 3 — Local Instance Data Integrity (Holistic)

Integrity health endpoint, integrity reporting, safe mode, documentation.

## Dependencies

- `epic-data-integrity-acid.md` (Epic 27) — backend guards + `format_version`
  (Phase 2 builds on `format_version` enforcement)
- `epic-content-hashing-distributed-integrity.md` — canonical record hashes
  (Phase 1 watchdog consumes record hashes for integrity verification)
- `epic-database-backup-recovery.md` — backup scripts (Phase 3 consumes backup
  integrity reports)
- `TASK-backup-restore-reliability-and-self-healing-for-federated-de.md` —
  self-healing loop (Phase 1 crash recovery delegates repair to this)
- `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md` —
  data-level checksums (Phase 1 watchdog consumes checksums)
- `epic-local-process-swarm.md` — supervisor + subprocess management
  (Phase 2 subprocess preservation builds on supervisor lifecycle)
- `epic-multi-instance-reconciliation.md` (Epic 26) — migration leadership
  (Phase 3 safe mode integrates with leadership)

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| --- | --- | --- |
| Data Integrity ACID (Epic 27) | `format_version`, backend guards | Phase 2 atomic operations enforce `format_version` |
| Content Hashing | Record hashes, content versioning | Phase 1 watchdog verifies record hashes |
| Database Backup/Recovery | Backup scripts, restore drills | Phase 1 crash recovery uses backup for repair |
| Data-Level Integrity | Checksums, integrity ledger | Phase 1 watchdog consumes checksums |
| Local Process Swarm | Supervisor, subprocess lifecycle | Phase 2 subprocess preservation |
| Multi-Instance Reconciliation | Migration leadership | Phase 3 safe mode |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| --- | --- | --- |
| (none yet) | — | TBD |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| --- | --- | --- |
| Integrity verdict | Health endpoint | Runtime integrity status |
| Crash recovery record | Crash recovery module | Post-crash state verification |
| Atomic operation log | Atomic operation framework | Track in-flight operations |
| Shutdown state | Shutdown handler | In-flight operation preservation |

### Cross-System Events

| Event | Direction | Purpose |
| --- | --- | --- |
| integrity.verdict | emitted | Integrity watchdog verdict |
| integrity.corruption | emitted | Corruption detected |
| crash.detected | emitted | Unclean shutdown detected on startup |
| crash.recovery | emitted | Recovery mode entered |
| shutdown.safe | emitted | All in-flight operations completed |
| atomic.start | emitted | Atomic operation started |
| atomic.commit | emitted | Atomic operation committed |
| atomic.rollback | emitted | Atomic operation rolled back |
| subprocess.drained | emitted | Subprocess work drained before kill |
| safe.mode.entered | emitted | Instance entered safe mode |
| safe.mode.exit | emitted | Instance exited safe mode |

## Testing Strategy

- **Phase 1**:
  - Unit: watchdog schedule evaluation, integrity check parsing, crash detection on startup
  - Integration: simulate crash (kill -9), restart, assert integrity check runs and detects corruption
  - Integration: inject corrupt data, assert watchdog detects and quarantines
- **Phase 2**:
  - Unit: atomic operation framework (success, rollback, partial failure)
  - Integration: signal during write, assert operation completes or rolls back
  - Integration: shutdown with in-flight operations, assert all complete or roll back
  - Integration: subprocess kill, assert in-flight work drained or checkpointed
- **Phase 3**:
  - Integration: integrity health endpoint returns comprehensive status
  - Integration: safe mode activated on corruption, writes rejected, reads served
  - Integration: integrity report covers all layers

## Security Considerations

- **Integrity watchdog access**: the watchdog must not be exploitable to cause
  denial of service (e.g., infinite integrity checks). Bounded by schedule and
  timeout.
- **Safe mode access**: safe mode must not be exploitable to lock out users.
  Only activated on detected corruption, with a manual override for operators.
- **Crash recovery**: recovery must not restore corrupted data. If corruption
  is detected, the instance must not serve potentially corrupted data.
- **Signal safety**: signal handlers must not introduce race conditions.
  Signal deferral must use atomic flags, not shared mutable state.
- **Subprocess preservation**: draining subprocess work must not expose
  sensitive data to the draining mechanism.

## Scope Boundary

In scope:
- Runtime integrity monitoring during application execution
- Crash recovery from partial writes
- Fail-safe execution (atomic operations, shutdown data safety, subprocess preservation)
- Signal-safe mutation
- Local-instance holistic integrity posture
- Integrity health endpoint and safe mode

Out of scope (owned by other epics):
- Database ACID guarantees (`epic-data-integrity-acid.md`)
- Content hashing (`epic-content-hashing-distributed-integrity.md`)
- Backup/recovery (`epic-database-backup-recovery.md`)
- Data-level checksums (`TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md`)
- Backup restore reliability (`TASK-backup-restore-reliability-and-self-healing-for-federated-de.md`)
- Fediverse/server-to-server mesh federation (`epic-federation-swarm-sync.md`)
- Deployment topologies (`epic-deployment-topologies.md`)
- Multi-instance reconciliation (`epic-multi-instance-reconciliation.md`)
- Tor/I2P/anonymity (`epic-anonymity-decentralization.md`)

## Linked Tasks

- `TASK-runtime-integrity-watchdog-crash-recovery` — runtime integrity
  watchdog, crash recovery on startup, in-flight operation tracking
- `TASK-fail-safe-execution-work-safety` — atomic operation framework,
  shutdown data safety, subprocess preservation, signal-safe mutation
- `TASK-local-instance-integrity-holistic` — integrity health endpoint,
  safe mode, integrity reporting, documentation

## References

- `epic-data-integrity-acid.md` — ACID guarantees (Epic 27)
- `epic-content-hashing-distributed-integrity.md` — content hashing
- `epic-database-backup-recovery.md` — backup/recovery
- `epic-local-process-swarm.md` — process decomposition + supervisor
- `epic-multi-instance-reconciliation.md` (Epic 26) — migration leadership
- `src/server/start.ts` — graceful shutdown, hard-exit guard, signal handling
- `src/db/index.ts` — SQLite WAL + FK pragmas
- `src/routes/` — transaction usage (inconsistent)
