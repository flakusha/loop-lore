<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Data migrations atomicity and concurrency guard

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Related:** TASK-format-version-migration, TASK-runtime-migration-staleness-guard

## Summary

Wrap up()+markApplied() in one transaction; add concurrency lock.

## Context

`src/db/data-migrations/runner.ts` applies table-scoped data migrations with two integrity gaps:

- `runDataMigrations` (`src/db/data-migrations/runner.ts:56`): `isApplied` check → `migration.up()` → `markApplied`. A crash or error between `up()` and `markApplied()` leaves the migration unrecorded — on next boot it re-runs. Non-idempotent migrations then corrupt data.
- Two server instances booting concurrently race on the `isApplied` check (TOCTOU) and double-apply.
- `isApplied`/`markApplied` also use `Kysely<any>` (banned pattern).

## Acceptance Criteria

- [ ] `migration.up()` + `markApplied()` executed inside a single `db.transaction()`; on failure the transaction rolls back and the migration stays unapplied (safe to retry)
- [ ] Concurrency guard: second concurrent runner waits for or skips a migration already being applied (single-writer lock or transactional upsert into `data_migrations`)
- [ ] `Kysely<any>` replaced with a typed `Kysely<DB>` or narrow interface
- [ ] Unit tests: crash-between simulation leaves migration re-runnable; concurrent invocation applies exactly once
- [ ] `bun test src/` green (db, data-migrations suites)
