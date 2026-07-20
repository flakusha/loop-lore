# Epic 26: Multi-Instance Reconciliation — Implementation Plan

**Status:** Draft — description under `tree/chore-docs-reconcile` (docs chore)\
**Proposed Epic Branch:** `epic/26`\
**Owner:** TBD\
**Blocks:** Epic 25 (Deployment Topologies), Epic 27 depends on its config guards

---

## Current State Assessment

| Area                   | File(s)                                   | State | Notes                                                                           |
| ---------------------- | ----------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| Kysely Migrator runner | `src/db/migrate.ts`                       | ✅    | Runs on **every** boot. **No leader election** — N replicas race.               |
| Schema manifest        | `src/db/schema-manifest.ts`               | ✅    | `verify()` diffs declared vs actual schema. **Test-only** — not run at startup. |
| Schema sync test       | `src/db/schema-sync.test.ts`              | ✅    | Proves `verify()` works; no startup enforcement.                                |
| Data transforms        | `data_migrations` table                   | ✅    | Tracks `from_version → to_version` rewrites, separate from DDL.                 |
| Session state          | `src/db/schema-core.ts` (`sessions`)      | ✅    | Persisted in DB — instances stateless, scalable in principle.                   |
| Real-time (SSE)        | `src/routes/activity-stream.ts` (Epic 19) | ✅    | **Per-process** — clients on other replicas don't get events.                   |
| Advisory lock / leader | —                                         | ❌    | No `pg_advisory_lock`, no wait-for-ready.                                       |
| Startup drift check    | —                                         | ❌    | `SchemaManifest.verify()` not invoked at boot.                                  |

---

## Problem Statement

architecture.md claims multi-user = "reverse proxy + multiple Bun workers or container instances." That is **not yet safe**:

1. **Migration race.** Cold deploy: every replica runs the Migrator. Concurrent DDL corrupts SQLite; errors/double-applies on Postgres.
2. **Schema drift.** A stale instance on an older image can serve against a migrated DB. `SchemaManifest.verify()` detects it but is unused at boot.
3. **Real-time is per-process.** SSE (Epic 19) only reaches clients on the same replica.

This epic makes multi-instance boot deterministic and drift-safe.

---

## Implementation Phases

### Phase 1 — Migration Leadership

**Goal:** Exactly one instance migrates; others wait for schema-ready.

| Task                                                                 | Files                                  | Effort |
| -------------------------------------------------------------------- | -------------------------------------- | ------ |
| Postgres advisory-lock leader (`pg_advisory_lock`); non-leader waits | `src/db/migrate.ts`                    | Med    |
| SQLite single-instance guard (refuse multi-instance boot)            | `src/db/migrate.ts`, `src/db/index.ts` | Low    |
| `waitForSchemaReady()` poll + exponential backoff + timeout          | `src/db/migrate.ts`                    | Med    |
| Boot order: acquire lock → migrate → release → serve                 | `src/db/index.ts` / `src/server.ts`    | Low    |

### Phase 2 — Schema Drift Detection & Reconciliation

**Goal:** No instance serves against a schema disagreeing with `SchemaManifest`.

| Task                                                                | Files                                            | Effort |
| ------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| Run `SchemaManifest.verify()` at startup on every instance          | `src/db/schema-manifest.ts`, `src/db/index.ts`   | Low    |
| Policy `strict` (refuse serve) vs `repair` (solo/SQLite auto-apply) | `src/config/sections/database.ts`                | Med    |
| Structured log + `/health/schema` reporting drift state             | `src/routes/health.ts` (Epic 25), `src/logger/*` | Med    |
| Unit + integration tests against deliberately broken schema         | `src/db/schema-sync.test.ts` (extend)            | Med    |

### Phase 3 — Cross-Instance Real-Time (optional)

**Goal:** SSE activity reaches clients on any replica.

| Task                                                                   | Files                                | Effort |
| ---------------------------------------------------------------------- | ------------------------------------ | ------ |
| Optional Redis pub/sub behind `REALTIME_BUS=redis`                     | `src/routes/activity-stream.ts`      | Med    |
| Sticky-session fallback documented (`ip_hash`) for `REALTIME_BUS=none` | `docs/guide/deployment.md` (Epic 25) | Low    |
| Per-process SSE retained when bus absent (backward compatible)         | `src/routes/activity-stream.ts`      | Low    |

---

## Open Questions

1. **Leadership mechanism:** `pg_advisory_lock` (no new dep) vs K8s init Job (cleaner, needs orchestration)? Recommend advisory lock + optional init-job override.
2. **Drift default:** `strict` vs `repair`? Recommend `strict` for Postgres multi-instance, `repair` for solo SQLite.
3. **Real-time bus:** build Redis now or ship sticky-session only and defer? Recommend sticky-session first, Redis behind flag.

---

## Recommended Priority

1. Phase 1 (leadership) — unblocks safe multi-instance; highest risk if skipped.
2. Phase 2 (drift) — cheap, reuses `SchemaManifest`.
3. Phase 3 (bus) — nice-to-have; sticky sessions suffice initially.

---

## Next Steps

1. Promote to git EPIC issue (`epic/26`).
2. Resolve Open Questions (1, 2).
3. Phase 1 spike: advisory-lock leader in `src/db/migrate.ts`.

---

## Dependencies

- Present: Kysely Migrator, `SchemaManifest` + `verify()`, `data_migrations`, SSE.
- New (optional): `ioredis` (Phase 3, behind flag) — or no dep via sticky sessions.

## Testing Strategy

| Test        | Coverage                                       | Files                                              |
| ----------- | ---------------------------------------------- | -------------------------------------------------- |
| Unit        | Advisory-lock election, backoff                | `src/db/migrate.test.ts` (new)                     |
| Integration | 2 instances boot vs 1 PG; exactly one migrates | `tests/integration/migration-leader.test.ts` (new) |
| Integration | Drift refuses/repairs per policy               | `src/db/schema-sync.test.ts` (extend)              |

## References

- `src/db/migrate.ts` — Migrator runner (Phase 1 target)
- `src/db/schema-manifest.ts` — `verify()` (Phase 2)
- `src/routes/activity-stream.ts` — SSE (Phase 3)
- Epic 25 (Deployment Topologies) — consumes these guards
- Epic 27 (Data Integrity & ACID) — backend selection guards
- `docs/meta/plan.md` — epic registry
