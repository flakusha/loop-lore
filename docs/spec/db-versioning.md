<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# DB Content Versioning & Migrations Reconciliation

Status: Partially implemented (see `.plan/epics/epic-db-content-versioning.md`). Migration 018 added `data_version` columns and the `data_migrations` table; `src/db/content-version.ts` exists for asset content versioning.

## Implemented

- Flat sequential migrations `001_init.ts` … `035_memory_source_chain.ts` under `src/db/migrations/`, auto-discovered by `getMigrationFiles()`; no `parts/` orchestrator; Kysely's internal table is the sole applied-migrations ledger (a `schema_version` table was deliberately dropped).
- `data_version` columns (migration 018): `actors` (default 0, card format), `users` (1, settings JSON), `personas` (1), `messages` (1); plus `data_migrations` table (id, name, applied_at).
- Migration tests exist as top-level `src/db/migrations.test.ts` + `src/db/migration-roundtrip.test.ts` (in-memory SQLite; opt-in via `CHECK_INCLUDE_HEAVY_DB_TESTS=1` in the coverage gate).

## Gaps / aspirational

- `data_migrations` table exists but no runner executes content transforms; `data_version` columns are not yet read/written by a content-version registry (the `ContentVersionDef` batch-migrator sketch in this spec's history remains a design).
- No rollback wiring (`migrateDown()` unused); no per-migration documentation index.
- Migration numbering gaps (002-007) — resolution: document, do NOT renumber (existing deployments keep history).

## Conventions (binding)

- Sequential numbering, no gaps, snake_case: `025_descriptive_name.ts`; each migration one concern; `down()` encouraged (Kysely `up`/`down` exports).
- Large migrations: single orchestrator + `parts/<name>/` sub-files if ever needed.

## Epics

- `.plan/epics/epic-db-content-versioning.md`

## See also

`src/db/migrate.ts`, `src/db/content-version.ts`, `docs/spec/migrations.md`, `docs/spec/schema.md`.
