<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# DB Content Versioning & Migrations Reconciliation

Status: schema layer implemented; row-level transform registry wired but empty.

## Implemented

- Flat sequential migrations `001_init.ts` … `056_xp_ledger_dedupe_unique.ts` under
  `src/db/migrations/`, auto-discovered by `getMigrationFiles()` in
  `src/db/migrate.ts`. No numbering gaps; `001_init.ts` is the single atomic
  v0 fold (all tables, indexes, triggers) produced by the DB v0 collapse.
- No `parts/` directory and no folding of shipped migrations — the deletion is
  intentional, not residue. AGENTS.md allows exactly two paths for schema
  change: append a new top-level `NNN_*.ts` migration, or extend the current
  HEAD migration before it ships.
- No `schema_version` table: Kysely's internal `kysely_migration` table is the
  sole applied-migration ledger. Dropped deliberately by the v0 collapse
  (see `CHANGELOG.md`).
- Two distinct versioning columns — do not conflate them:
  - `content_version` (`integer NOT NULL DEFAULT 0`) on 16 tables:
    `assets`, `actor_lore_entries`, `blog_posts`, `character_stats`,
    `characters`, `chats`, `crafting_recipes`, `items`, `locations`,
    `messages`, `quests`, `request_results`, `shadow_notes`, `whitenotes`,
    `world_lore_entries`, `worlds`. Added by `001_init.ts` (7 tables) and
    `034_content_versioning_heavy_tables.ts` (the remaining 9).
  - `row_version` (`integer NOT NULL DEFAULT 0`) on 4 tables: `actors`,
    `personas`, `users`, `messages`. This is the per-table row-format version
    that `data_migrations` tracks — NOT `content_version`.
- `data_migrations` table: columns `table_name`, `from_version`, `to_version`,
  `description`, `applied_at`, primary key `(table_name, to_version)`.
- `runDataMigrations` exists in `src/db/data-migrations/runner.ts` and is wired
  at `src/server/start.ts` after `runMigrations` and before seeding. It
  discovers transforms by scanning `src/db/data-migrations/<table>/v<N>_*.ts`
  (each sub-directory is a table name).
- Migration tests: top-level `src/db/migrations.test.ts` and
  `src/db/migration-roundtrip.test.ts` (in-memory SQLite; run by the coverage
  gate by default — see `scripts/check/parallel/test-skip.mjs`).

## Gaps / aspirational

- The runner discovers no transforms yet: there are no
  `src/db/data-migrations/<table>/` directories, so `runDataMigrations` is a
  no-op. Neither `content_version` nor `row_version` is read/written by any
  registry — the `ContentVersionDef` batch-migrator sketch in this spec's
  history remains a design.
- No rollback wiring (`migrateDown()` unused); no per-migration documentation
  index.
- `001_init.ts` carries a backlog note to split it into one focused
  `NNN_*.ts` file per domain once the schema stabilizes. It is deliberately a
  single file today (atomic review, no cross-file ordering hazards) and its
  internal `// --- <domain> ---` section markers are labels only — they name
  no files, because the historical `parts/` modules and the numbered
  migrations it absorbed no longer exist.

## Conventions (binding)

- Sequential numbering, no gaps, snake_case: `056_descriptive_name.ts`; each
  migration one concern; `down()` encouraged (Kysely `up`/`down` exports).
- Never renumber an applied migration. Numbers are recycle-unsafe: the v0
  collapse left a `rotation_history` section marker inside `001_init.ts` while
  the live `006_worlds_rules_column.ts` is an unrelated migration — that
  collision held for every absorbed number, which is why the markers carry no
  numbers today.
- Large migrations stay a single file; no orchestrator, no `parts/` sub-files.

## Epics

- `.plan/epics/epic-db-content-versioning.md`

## See also

`src/db/migrate.ts`, `src/db/data-migrations/`, `docs/spec/migrations.md`, `docs/spec/schema.md`.
