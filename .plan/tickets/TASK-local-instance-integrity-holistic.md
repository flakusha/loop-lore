<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Local Instance Integrity — Holistic Posture

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-runtime-integrity-fail-safes

## Summary

Integrate all integrity mechanisms into a unified local-instance
integrity posture: integrity health endpoint, safe mode (read-only
with writes rejected when integrity is compromised), integrity
reporting, and an authoritative integrity playbook for the local instance.

This phase brings together the runtime integrity watchdog (Phase 1),
the fail-safe execution framework (Phase 2), and the existing ACID,
content hashing, and backup/recovery epics into a single coherent
integrity posture for the local instance.

## Why

Phases 1 and 2 implement individual integrity mechanisms, but they
are not yet unified into a coherent posture. Operators need a single
view of the instance's integrity status, a clear escalation path
(clean → degraded → safe mode), and a documented playbook for
responding to integrity failures. Without this, the mechanisms
exist but are not operationally useful.

## Current State

- `epic-data-integrity-acid.md` (Epic 27) — backend guards +
  `format_version` (Phase 1 complete, Phases 2-3 not started)
- `epic-content-hashing-distributed-integrity.md` — record hashes,
  content versioning (not started)
- `epic-database-backup-recovery.md` — backup scripts (drafted)
- `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md` —
  data-level checksums (not started)
- `TASK-backup-restore-reliability-and-self-healing-for-federated-de.md` —
  backup restore reliability (not started)
- `src/server/start.ts` — graceful shutdown, hard-exit guard, signal handling
  (no data integrity integration)
- Health endpoint exists but does not cover integrity status.

## Acceptance Criteria

### Integrity Health Endpoint

- [ ] Unified integrity health endpoint that surfaces:
  - Runtime integrity watchdog status (last verdict, last check time)
  - Crash recovery status (last shutdown was clean or unclean)
  - Atomic operation health (active operations, recent rollbacks)
  - Fail-safe status (signal deferral state, subprocess drain state)
  - Database integrity (`PRAGMA integrity_check` result)
  - Content integrity (record hash verification status)
  - Backup integrity (last backup age, last validation verdict)
- [ ] Health endpoint returns a structured status object with a
  composite integrity level: `clean`, `degraded`, or `unsafe`.
- [ ] Health endpoint is consumable by monitoring systems and
  the `epic-federation-swarm-sync.md` mesh coordinator (for
  federated instances).

### Safe Mode

- [ ] When integrity is compromised (watchdog detects corruption,
  crash recovery detects inconsistency, or manual operator trigger),
  the instance enters **safe mode**.
- [ ] Safe mode: all write endpoints return 503 Service Unavailable.
  Read endpoints continue to serve data (potentially from a last-known-good
  backup if the live data is compromised).
- [ ] Safe mode is exited after integrity is restored and an operator
  acknowledges the recovery. Manual override is available for
  operators who need to force-exit safe mode.
- [ ] Safe mode state is durable (survives instance restart).
  If the instance restarts while in safe mode, it remains in safe mode
  until integrity is restored and the operator acknowledges recovery.
- [ ] Safe mode escalation path is documented: clean → degraded
  (warnings) → unsafe (safe mode).

### Integrity Reporting

- [ ] Periodic integrity reports (daily or on-demand) covering all
  layers: database, content, runtime, fail-safe, and backup.
- [ ] Reports are structured (JSON) and include: integrity level,
  findings, remediation steps taken, and recommendations.
- [ ] Reports are published to the health endpoint and logged.
- [ ] Reports can be exported for external audit or federation
  (consumed by `epic-federation-swarm-sync.md` mesh coordinator).

### Documentation

- [ ] Authoritative integrity playbook for the local instance:
  how integrity mechanisms work, how to interpret health endpoint
  output, how to respond to integrity failures, how to enter/exit
  safe mode, how to run integrity checks manually.
- [ ] Integration notes for each dependent epic (ACID, content hashing,
  backup/recovery, data-level integrity).
- [ ] Troubleshooting guide for common integrity failure scenarios.

### `bun run check` green; integration tests for health endpoint,
  safe mode, and integrity reporting.

## Implementation Notes

- **Health endpoint**: extend the existing health endpoint (from
  `epic-database-backup-recovery.md` TASK-BKP-003 scope) with
  integrity-specific fields. Reuse the existing health endpoint
  infrastructure.
- **Safe mode**: implement as a global state machine (clean → degraded
  → unsafe). State transitions are triggered by integrity verdicts
  and operator actions. Safe mode state is stored in a durable
  configuration store.
- **Integrity reporting**: use the existing reporting infrastructure
  (from `epic-database-backup-recovery.md` and
  `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md`).
  Aggregate findings from all integrity layers into a single report.
- **Federation integration**: the health endpoint and integrity reports
  are consumable by the mesh coordinator
  (`epic-federation-swarm-sync.md`). When a federated instance reports
  `unsafe`, the coordinator can route traffic away from it.
- **Sequence**: Phase 3 of `epic-runtime-integrity-fail-safes`.
  Depends on Phases 1 and 2 being complete.

## Files

- `src/integrity/health.ts` — unified integrity health endpoint
- `src/integrity/safe-mode.ts` — safe mode state machine
- `src/integrity/reporting.ts` — integrity reporting
- `src/integrity/playbook.ts` — integrity playbook documentation
- `src/config/sections/` — safe mode and reporting config section
- `tests/` — integration tests for health endpoint, safe mode, reporting

## Dependencies

- `epic-runtime-integrity-fail-safes` (this epic)
- `TASK-runtime-integrity-watchdog-crash-recovery` — Phase 1
  (health endpoint consumes watchdog verdicts)
- `TASK-fail-safe-execution-work-safety` — Phase 2
  (health endpoint consumes atomic operation health and fail-safe status)
- `epic-data-integrity-acid.md` — ACID guarantees
- `epic-content-hashing-distributed-integrity.md` — content integrity
- `epic-database-backup-recovery.md` — backup integrity
- `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md` — data-level integrity
- `TASK-backup-restore-reliability-and-self-healing-for-federated-de.md` — backup restore reliability
- `epic-federation-swarm-sync.md` — mesh coordinator health integration
