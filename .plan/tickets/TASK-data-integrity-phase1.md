<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Data Integrity Phase 1 — Config Guards & Backend Selection

**Status:** ✅ Complete
**Priority:** High
**Effort:** Low
**Epic:** epic-data-integrity-acid

## Summary

Phase 1 of the Data Integrity epic: Backend selection guards and config validation. This is a **blocking issue** for safe production deployment — SQLite multi-instance configurations are currently accepted but unsafe over network filesystems.

## Linked Epics

- `epic-data-integrity-acid.md` (Phase 1)
- `epic-deployment-topologies.md` (consumes guards)
- `epic-multi-instance-reconciliation.md` (hard prerequisite)

## Acceptance Criteria

### Backend Selection Guard

- [ ] Reject `type=sqlite` when `INSTANCE_COUNT > 1`
- [ ] Reject `type=sqlite` when `UNSAFE_SQLITE_MULTIINSTANCE` is set
- [ ] Clear error message explaining why SQLite is unsafe for multi-instance
- [ ] Suggest Postgres as alternative for multi-instance deployments
- [ ] Config validation tests for rejection logic

### Network Filesystem Warning

- [ ] Detect NFS/EFS/etc. in SQLite WAL path
- [ ] Warn (not error) when WAL path is on network filesystem
- [ ] Include mitigation advice in warning message
- [ ] Allow override with explicit acknowledgment

### Documentation Correction

- [ ] Remove stale MySQL claim from `docs/spec/architecture.md`
- [ ] Update to state Postgres-only (config is source of truth)
- [ ] Cross-reference `src/config/sections/database.ts` as authoritative
- [ ] Link to Epic 27 for full ACID matrix

## Files

- `src/config/sections/database.ts` — backend enum (authoritative)
- `src/config/load.ts` — config validation
- `src/db/index.ts` — WAL path detection
- `docs/spec/architecture.md` — stale MySQL claim

## Integration Points

### Systems This Epic Depends On

| System                        | What It Provides                | How Used                 |
| ----------------------------- | ------------------------------- | ------------------------ |
| Deployment Topologies         | Instance count, topology config | Multi-instance detection |
| Multi-Instance Reconciliation | Leadership, drift detection     | Prerequisite for Phase 2 |

### Systems That Depend On This Epic

| System                 | What It Consumes       | How Used                           |
| ---------------------- | ---------------------- | ---------------------------------- |
| Deployment Topologies  | Backend guards         | Topology safety validation         |
| Data Integrity Phase 2 | Safe backend selection | Optimistic concurrency enforcement |

### Cross-System Events

| Event                           | Direction  | Purpose                            |
| ------------------------------- | ---------- | ---------------------------------- |
| `config.invalid`                | emits      | Reject unsafe backend combinations |
| `config.warning`                | emits      | Network filesystem detection       |
| `deployment.topology.validated` | subscribes | Apply backend guards               |
