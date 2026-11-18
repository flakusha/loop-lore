<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Concurrent migrations race on a shared SQLite file

**Status:** Done
**Status Note (2026-11-18):** Closed by `7dec974bb`: `src/db/migrate.ts:190-204` runs the migrator inside `BEGIN IMMEDIATE` with a busy timeout and re-checks `kysely_migration` in the transaction, so two processes sharing one SQLite file cannot half-apply a migration.
**Priority:** high
**Effort:** Medium
**Epic:** epic-multi-instance-reconciliation
**Tags:** db, sqlite, migrations, concurrency, boot

**Summary:**

The Kysely migrator runs on every boot with no cross-process lock. Two processes opening the same SQLite file race the migration: both see the same `kysely_migration` state, both try to apply the same DDL, and the loser can half-apply a migration. There is no `BEGIN IMMEDIATE` and no advisory lock.

Explicitly NOT building:

- A leader election service or a dedicated migration job.
- Postgres advisory locks (no Postgres runtime exists).
- A schema-version handshake that refuses to serve while another instance migrates.

**Caveats:** busy timeouts, partially-applied migrations, sqlite locking semantics

**Context:**

- `src/db/migrate.ts:151-178` runs the migrator; there is no cross-process guard around it.
- `src/db/index.ts:45,47` calls it on every boot, so a second instance boots straight into the same file.
- The migration runner does not open the transaction in `IMMEDIATE` mode, so the read of `kysely_migration` and the write of the new migration are not serialized between processes.
- This is the concrete instance of the migration race that `epic-multi-instance-reconciliation.md` lists as problem statement item 1 ("Cold deploy: every replica runs the Migrator. Concurrent DDL corrupts SQLite").
- It is only reachable today because the instance slug is not derived from the configured port (**F2**): two config-driven instances resolve the same `default` directory. Fixing the slug reduces the frequency but does not remove the race, because `LOOP_LORE_INSTANCE` and a shared mount can still point two processes at one file.

Minimal fix (report 01 section (c) F7): run the migrator inside `BEGIN IMMEDIATE` and re-check `kysely_migration` inside the transaction, so the second process sees the first's applied migration and skips it. A bounded busy timeout keeps a contended boot from hanging forever.

**Acceptance Criteria:**

- [x] The migration run is serialized across processes on the same database file (e.g. `BEGIN IMMEDIATE` plus an in-transaction re-check of the applied-migration list).
- [x] A second process booting against an already-migrated file applies nothing and exits cleanly.
- [x] Two processes booting simultaneously against one file end with exactly one applied migration set and no partially-applied DDL.
- [x] The busy timeout is bounded and produces an actionable error rather than an unbounded hang.
- [x] A regression test covers two concurrent migrators against one SQLite file (`src/db/migrate.test.ts:45-79`).
- [x] Tests passing, documentation updated.
**Resolved:** 2026-11-18T05:38:50.610Z Closed by ticket reconciliation on dev (2026-11-18); verification notes cite the landed commits.
