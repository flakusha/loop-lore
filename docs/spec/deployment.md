<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Deployment & ACID Guarantees

## Overview

Loop-lore supports two database backends — SQLite (WAL mode, single instance) and Postgres (remote, multi-instance) — with different ACID guarantees. This spec is the authoritative reference for operators choosing a backend and understanding what integrity guarantees they get.

The backend is selected via `type` in `src/config/sections/database.ts`. The config loader enforces safety guards (`validateDatabaseSafety()` in `src/config/load/safety.ts`) that reject unsafe combinations at startup.

## ACID Guarantees by Backend

| Property             | SQLite (WAL, single instance)             | Postgres (remote, multi-instance)                |
| -------------------- | ----------------------------------------- | ------------------------------------------------ |
| Atomicity            | ✅ per transaction                        | ✅ per transaction                               |
| Consistency          | ✅ (FK/CHECK enforced)                    | ✅ (FK/CHECK + richer constraints)               |
| Isolation            | ✅ (WAL: readers + 1 writer)              | ✅ MVCC (snapshot isolation, concurrent writers) |
| Durability           | ✅ (fsync on commit; WAL checkpoint)      | ✅ (fsync + replication-safe with managed PG)    |
| Concurrent writers   | ❌ serializes to 1 writer                 | ✅ many writers, row-level locks                 |
| Multi-container safe | ❌ locking breaks over NFS/shared volumes | ✅ designed for networked access                 |
| Migration leadership | N/A (single instance)                     | 🔜 planned via `pg_advisory_lock` (Epic 26)      |
| Recommended for      | A, B                                      | C, D, E                                          |

**Consequence:** Topologies D/E are Postgres-only. SQLite is correct only for A/B. `format_version` gives row-level optimistic concurrency on either backend once Phase 2 enforces it.

## Write-Path Notes

### `format_version` Optimistic Concurrency

`format_version` columns exist on core tables (`users`, `actors`, `messages`, `personas`, `world_states`, `chat_participants`, `actor_memories`) as an optimistic-concurrency anchor.

**Status: Planned (Phase 2).** The write path does not yet enforce `format_version`. When enforced, the pattern will be:

```sql
UPDATE … WHERE id = ? AND format_version = ?
```

A zero-row result indicates a stale write — the row was modified by another transaction since the reader fetched it. The route handler will return `409 Conflict` (error envelope) on version mismatch.

**Planned enforcement scope:** High-contention tables first — `messages`, `chat_participants`, `actor_memories`, `world_states`. Other tables follow as needed.

**Conflict resolution:** Reject-only (`409`) for v1. No last-write-wins toggle.

### Transaction Boundaries

- **SQLite (WAL):** Single writer at a time. Readers do not block writers (WAL mode). Transactions are serializable by file lock.
- **Postgres:** MVCC snapshot isolation. Concurrent writers proceed with row-level locks. Deadlocks possible under high contention — `pg_advisory_lock` for migration leadership is planned (Epic 26).

### Multi-Container Safety

SQLite file-locking is unsafe over network filesystems (NFS, EFS, shared container volumes). The config loader (`src/config/load/safety.ts`) rejects `type=sqlite` when `INSTANCE_COUNT > 1` or `UNSAFE_SQLITE_MULTIINSTANCE` is set. Postgres is designed for networked access and is the only safe choice for multi-container deployments.

## Backend Selection Guidance

| Topology | ID | Backend | Instances | Safe? |
| -------- | -- | ------- | --------- | ----- |
| Local solo | A | SQLite | 1 (Bun process) | ✅ |
| Single container / binary | B | SQLite | 1 | ✅ |
| Docker Compose | C | Postgres | 1 app + 1 PG | ✅ |
| Reverse proxy + N app | D | Postgres | N app + 1 PG (or pooler) | ✅ |
| Kubernetes | E | Postgres (StatefulSet or managed) | N replicas + Ingress | ✅ |

**Hard rule:** Topologies D and E require `type=postgres`. SQLite is single-writer — valid only for A/B. Mixing SQLite + N instances is rejected at startup by `validateDatabaseSafety()`.

**Network filesystem warning:** When SQLite WAL path is on a network filesystem (NFS/EFS/etc.), the server logs a warning. Use Postgres for any networked storage.

## Related Specs

- [`docs/spec/build-deploy.md`](./build-deploy.md) — build process, Docker, deployment options
- [`docs/spec/architecture.md`](./architecture.md) — system layers, data layer abstraction
- [`docs/spec/data-integrity-acid.md`](./data-integrity-acid.md) — data integrity specification
- [`docs/spec/multi-instance-reconciliation.md`](./multi-instance-reconciliation.md) — migration leadership, drift detection
- [`docs/spec/db-versioning.md`](./db-versioning.md) — content versioning, migrations

## Epics

- `.plan/epics/epic-data-integrity-acid.md` — backend guards, `format_version` enforcement, ACID matrix
- `.plan/epics/epic-deployment-topologies.md` — topology definitions, Docker/K8s packaging
- `.plan/epics/epic-multi-instance-reconciliation.md` — advisory locks, schema drift
