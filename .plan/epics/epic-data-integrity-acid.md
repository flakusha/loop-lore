# Epic 27: Data Integrity & ACID Guarantees — Implementation Plan

**Status:** Draft — description under `tree/chore-docs-reconcile` (docs chore)\
**Proposed Epic Branch:** `epic/27`\
**Owner:** TBD\
**Depends on:** Epic 26 (Multi-Instance Reconciliation) — hard prerequisite. Epic 27 and Epic 25 are independently sequenced after Epic 26 (suggested order: 26 → 27 → 25); neither lists the other as a dependency. Epic 25 consumes this epic's backend guards but is not a prerequisite.

---

## Current State Assessment

| Area              | File(s)                                                                             | State | Notes                                                                   |
| ----------------- | ----------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| DB config         | `src/config/sections/database.ts`                                                   | ✅    | `type: "sqlite"                                                         |
| Kysely init + WAL | `src/db/index.ts`                                                                   | ✅    | SQLite opened in WAL (plan.md). Dialect swap to Postgres via `url`.     |
| Row versioning    | `format_version` cols on core tables (`users`, `actors`, `messages`, `personas`, …) | ✅    | Optimistic-concurrency anchor — **write path does not enforce it yet**. |
| Data transforms   | `data_migrations` table                                                             | ✅    | Tracks `from_version → to_version` rewrites.                            |
| Config validation | `src/config/load.ts`                                                                | ✅    | No guard against SQLite + multi-instance.                               |
| ACID doc          | —                                                                                   | ❌    | No authoritative ACID matrix per backend.                               |

---

## Problem Statement

The integrity contract is implicit and partly unenforced:

1. **`format_version` is dead infrastructure.** Columns exist on most tables but the write path never checks them — concurrent edits to the same row can clobber without detection.
2. **No backend-selection guard.** `type=sqlite` + N instances is accepted at config load, yet SQLite file-locking is unsafe over network filesystems / shared container volumes (topologies D/E).
3. **Stale docs.** architecture.md claims MySQL support; `database.ts` does not. Needs reconciliation.
4. **No ACID reference.** Operators can't tell what guarantees they get per backend.

---

## Implementation Phases

### Phase 1 — Backend Selection & Config Guards

**Goal:** Fail fast on unsafe combinations.

| Task                                                                              | Files                                                   | Effort |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- | ------ |
| Reject `type=sqlite` when `INSTANCE_COUNT > 1` (or `UNSAFE_SQLITE_MULTIINSTANCE`) | `src/config/sections/database.ts`, `src/config/load.ts` | Low    |
| Warn when SQLite WAL path is on a network filesystem (NFS/EFS/etc.)               | `src/db/index.ts`                                       | Low    |
| Correct architecture.md MySQL claim → Postgres-only                               | `docs/spec/architecture.md`                             | Low    |

### Phase 2 — `format_version` Optimistic Concurrency

**Goal:** Detect and reject stale writes.

| Task                                                                                                       | Files                               | Effort |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------ |
| Write policy: `UPDATE … WHERE id=? AND format_version=?` → conflict on 0 rows                              | route handlers + `src/db/*` helpers | Med    |
| Enforce on high-contention tables first: `messages`, `chat_participants`, `actor_memories`, `world_states` | route handlers                      | Med    |
| Return `409 Conflict` (error envelope) on version mismatch                                                 | `src/routes/http-utils.ts`          | Low    |
| Unit tests for conflict path                                                                               | `src/db/*.test.ts` (new)            | Med    |

### Phase 3 — ACID Matrix & Operator Docs

**Goal:** Authoritative integrity contract.

| Task                                                                     | Files                           | Effort |
| ------------------------------------------------------------------------ | ------------------------------- | ------ |
| `docs/spec/deployment.md` ACID matrix (SQLite vs Postgres)               | `docs/spec/deployment.md` (new) | Low    |
| Write-path notes: where `format_version` applies, transaction boundaries | `docs/spec/deployment.md`       | Low    |
| Link from `docs/spec/build-deploy.md` + Epic 25 deploy guide             | `docs/spec/build-deploy.md`     | Low    |

---

## ACID Guarantees by Backend

| Property             | SQLite (WAL, single instance)             | Postgres (remote, multi-instance)                |
| -------------------- | ----------------------------------------- | ------------------------------------------------ |
| Atomicity            | ✅ per transaction                        | ✅ per transaction                               |
| Consistency          | ✅ (FK/CHECK enforced)                    | ✅ (FK/CHECK + richer constraints)               |
| Isolation            | ✅ (WAL: readers + 1 writer)              | ✅ MVCC (snapshot isolation, concurrent writers) |
| Durability           | ✅ (fsync on commit; WAL checkpoint)      | ✅ (fsync + replication-safe with managed PG)    |
| Concurrent writers   | ❌ serializes to 1 writer                 | ✅ many writers, row-level locks                 |
| Multi-container safe | ❌ locking breaks over NFS/shared volumes | ✅ designed for networked access                 |
| Migration leadership | N/A (single instance)                     | ✅ via `pg_advisory_lock` (Epic 26)              |
| Recommended for      | A, B                                      | C, D, E                                          |

**Consequence:** Topologies D/E are Postgres-only. SQLite is correct only for A/B. `format_version` gives row-level optimistic concurrency on either backend once Phase 2 enforces it.

---

## Open Questions

1. **`format_version` scope:** all tables or high-contention first? Recommend high-contention first (Phase 2).
2. **Conflict resolution:** reject (`409`) only, or also expose last-write-wins toggle? Recommend reject only for v1.
3. **MySQL:** drop the stale claim entirely, or keep MySQL as future dialect? Recommend drop (config is source of truth).

---

## Recommended Priority

1. Phase 1 (guards + doc correction) — prevents unsafe deploys, cheap.
2. Phase 3 (ACID doc) — documents the contract.
3. Phase 2 (`format_version` enforcement) — higher effort, can follow Epic 26.

---

## Next Steps

1. Promote to git EPIC issue (`epic/27`).
2. Resolve Open Questions (1, 3).
3. Phase 1: config guard + architecture.md correction.

---

## Dependencies

- Present: `format_version` columns, `data_migrations`, WAL init, config loader.
- New: none.

## Testing Strategy

| Test        | Coverage                          | Files                                                    |
| ----------- | --------------------------------- | -------------------------------------------------------- |
| Unit        | Config rejects sqlite+multi       | `src/config/load.test.ts` (extend)                       |
| Unit        | Stale write → 409                 | `src/db/*.test.ts` (new)                                 |
| Integration | Concurrent edit conflict detected | `tests/integration/optimistic-concurrency.test.ts` (new) |

## References

- `src/config/sections/database.ts` — backend enum (authoritative)
- `src/db/index.ts` — WAL init
- `src/db/schema-*.ts` — `format_version` columns
- Epic 25 (Deployment Topologies) — consumes guards
- Epic 26 (Multi-Instance Reconciliation) — leadership/drift
- `docs/spec/architecture.md` — stale MySQL claim
- `.plan/implementation-plan.md` — epic registry

## Related Epics

- **Epic 26 (Multi-Instance Reconciliation)** — migration leadership / drift detection; `format_version` enforcement here complements its concurrency model.
- **Epic 25 (Deployment Topologies)** — consumes the backend-selection + ACID guards produced here to gate SQLite-vs-Postgres topologies.
- **Epic 27 → Epic Testing & QA** — `format_version` optimistic-concurrency (Phase 2) needs the concurrency test work tracked in Epic Testing & QA (integration conflict tests, type/complexity gates).

## Scope Boundary

- **IN:** backend-selection guards, `format_version` write-path enforcement, ACID reference doc.
- **OUT:** migration leadership/orchestration (Epic 26 owns it); deploy manifests/K8s (Epic 25 owns it); general test infrastructure (Epic Testing & QA owns it).

## Linked Tasks

- TASK-data-integrity-acid.md
