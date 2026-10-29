<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-rsi-safe-harness-db-snapshot-migration-replay

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-recursive-self-improvement

**Summary:**

Owner epic: `.plan/epics/epic-recursive-self-improvement.md`

## Background

RSI epic describes a watchdog+agent loop but ships no sandbox policy module. What exists:

- In-memory test DB: `src/test-utils/create-test-db.ts:28-44` (`createTestDb`, `bun:sqlite :memory:` + `runMigrations()`); single FK-pragma enforcement via `createSqliteDialect`.
- Migration ordering: `src/db/migrate.ts:22` `MIGRATION_FILENAME` regex, `:44-53` numeric-aware `compareMigrationNames()`.
- Rollback round-trip precedent: `src/db/migration-roundtrip.test.ts:164-174` rolls every migration down, asserts zero tables remain.
- Missing (grep-negative): no `db-snapshot.ts`, no `withEphemeralDb`, no `migration-replay` gate.

Established solutions: SQLite file-copy snapshot - https://www.zero-downtime-schema.com/ci-cd-migration-automation/automated-migration-testing/ ; Hermes agent ephemeral state-DB guard - https://github.com/NousResearch/hermes-agent/blob/ee472a7f/tests/hermes_cli/test_state_db_guard.py . Docker/bubblewrap sandbox DEFERRED to nightly tier (worktree+bun ~2s vs container minutes).

## Change

1. `tests/harness/db-snapshot.ts` - `snapshotDbFile()`, `restoreDbFile()`, `withEphemeralDb(fn)` (file DB under `.tmp/rsi-<runId>/`, deleted in `afterAll`; `:memory:` fast path preserved).
2. `RSI_RUN=1` startup guard - refuse when resolved `DB_PATH` is under repo data dir; `LOOP_LORE_DB_PATH` override into `.tmp/`.
3. `scripts/check/migration-replay.mjs` gate - empty DB, `runMigrations()`, schema-hash compare vs `src/validation/db-schemas.ts`; fail on ordering/hash drift; wire into `gate-table.mjs` advisory-first.
4. Rollback round-trip test - trivial patch + snapshot, restore, byte-identical tree + DB.

## Acceptance

- Unit suites still use `:memory:`; integration/self-mod runs use ephemeral file path, cleaned up even on failure.
- Migration-replay gate green on current `080_*`; intentionally broken ordering fixture fails gate.
- Rollback round-trip test passes; production DB path can never open with `RSI_RUN=1` (guard test).

**Caveats:** TOCTOU: guard resolves `DB_PATH` after all overrides, immediately before open. Security: ephemeral DBs under `.tmp/`, never committed. Parallelism: unique `runId` dirs. Partial failure: atomic restore (copy aside + rename). Rollback: snapshot/restore is itself the rollback primitive, tested incl. mid-write crash. Stale state: snapshot older than migration head rejected. Observability: log snapshot/restore/guard-refusal with run id.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
