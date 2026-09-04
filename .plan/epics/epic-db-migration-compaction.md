<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: DB Migration Compaction — final-form single migration (Path B)

**Status:** 📝 Planned (document only — no migration edits until reviewed)
**Priority:** Medium (maintainability; no runtime behavior change on a fresh DB)
**Effort:** High
**Type:** Refactor Epic
**Tags:** db, schema, migrations, squashing, kysely, technical-debt

## Summary

Collapse the current **79 top-level migration files** (`src/db/migrations/001_init.ts` … `076_drop_chats_visual_novel.ts`) into a **single final-form migration** that emits the completed schema as pure `CREATE TABLE`/`CREATE INDEX`/`CREATE VIRTUAL TABLE` (plus FTS5 `sql` blocks + triggers).

**Approach: Path B (final-form DDL), decomposed into `parts/`.** Dump the canonical schema from a *fresh* migration run, normalize the two defect classes below, and re-emit it as Kysely `.schema` migrations — one slim top-level `001_init.ts` orchestrating an **extensive `parts/` tree**, mirroring the existing `parts/001–008` idiom. This keeps each grouping reviewable AND preserves the generators' `parts/` parse contract. No `DROP`, no `PRAGMA foreign_keys` on/off toggle.

This supersedes the earlier "23 contiguous epochs" (private-function wrapper) draft. That mechanism is **invalid** for this repo: the schema generators extract the `up()` body via non-greedy regex (`…Promise<void>\s*\{([\s\S]*?)\n\}`), so wrapping member bodies in private functions inside `up()` would truncate extraction and drop every table from generated types.

## Why fold this way

- Generators (`scripts/generate-db-types.ts`, `scripts/generate-schema-manifest.ts`) parse migrations **textually**, not by execution. They capture only column name/type/notNull/hasDefault/primaryKey from `.createTable()/.addColumn()` chains. They do **not** capture check constraints, FKs, indexes, or raw-`sql` FTS blocks — those exist solely by virtue of the migration chain.
- A raw-SQL dump would therefore leave the generators with nothing to parse → every `schema-*.ts` emptied → the entire Kysely type layer breaks. **Mandatory: keep Kysely `.schema` form** in the single migration.
- Normalizing default *values* (`datetime('now')`, `'none'`) is invisible to the generators (they record `hasDefault` only), so zero-diff artifacts are achievable.

## Two defect classes fixed in the final form

1. **JS-injected static timestamps.** 10 migrations bake `new Date().toISOString()` as a `defaultTo(...)` *value* — a literal string pinned at migration-author time — instead of `sql\`(datetime('now'))\``. Every fresh DB gets these `created_at`/`updated_at` columns defaulting to a stale fixed timestamp. Affected tables: `chat_setup_templates`, `world_timeline_events`, `chat_sections`, `chat_backgrounds`, `chat_background_assignments`, `chat_invites`, `world_invites`, `chat_location_events`, `proactive_messaging_config`, `character_internal_traits`, `world_timelines`, `music_links`, `character_world_setup`. Source files: `029`, `030`, `031`, `032`, `033`, `040`, `041`, `044`(?) — see grep of `new Date().toISOString()`. Final form normalizes all to `(datetime('now'))`.
2. **`chats.encryption_level` default `'public'`.** Orphan `parts/009_encryption_level_default.ts` (imported by nothing, never runs) was meant to change the default `'public'`→`'none'` but never applied. Final form sets `'none'` directly (valid `EncryptionLevel` = `none|standard|at-rest`).

## Current State (reviewed 2026-09-04)

- `src/db/migrations/` holds **79 top-level files** plus `parts/` (9 files).
- `src/db/migrate.ts` scans only the root; filename (minus `.ts`) = migration name = `kysely_migration.name` row. `assertMigrationsNotStale()` fail-fasts when an applied name is absent.
- `parts/001–008` is `001_init`'s decomposition; `parts/009` is **orphaned**.
- Migrations run at boot from `src/server/start.ts:116` (`runMigrations`) and from `src/db/reinit.ts` (reinit path). `src/db/migrate.ts` `import.meta.main` runs standalone.
- No migration imports a sibling (0 matches for `migration-helpers`; `001_init`→`parts/` only). Four function-scoped decls and one module-level `const ROLES_SQL` (`047`) — all inlined in the fold.
- `047_user_role_expansion.ts` rebuilds `users` with a `PRAGMA foreign_keys=OFF/ON` toggle to widen `ck_users_role` — obsoleted by the final-form single `CREATE` of `users`.

## Design Invariants

1. **Final schema identical.** After folding, `bun run db:sync-types && bun run db:sync-manifest` produce **zero diff** in every generated artifact (`schema-*.ts`, `schema.ts`, `schema-manifest.ts`, `insert-helpers.ts`, `validation/db-schemas.ts`); `schemas:check` green.
2. **Pure CREATE.** No `DROP TABLE`, no `DROP COLUMN`, no `PRAGMA foreign_keys=OFF`. Each table created once in final form.
3. **FK-safe ordering.** Tables emitted in dependency order so every FK target exists before its dependent.
4. **Generator contract preserved.** Kysely `.schema` DSL (`createTable/addColumn/createIndex/addCheckConstraint`) + raw `sql` only for FTS5 virtual tables and triggers.
5. **Guard stays.** `assertMigrationsNotStale` retained.

## Required Code/Test Changes (cutover checklist)

1. **Write `001_schema.ts`** (single final-form migration) — or fold into the existing `001_init`+`parts/` structure mirroring the `001_init` orchestration idiom (preferred for reviewability). Delete 78 superseded top-level files + orphan `parts/009`.
2. **Regenerate schemas** (`db:sync-types` + `db:sync-manifest`) → zero diff; `schemas:check` green.
3. **Rewrite migration-coupled tests**: `migration-076.test.ts` (hardcodes `076_drop_chats_visual_novel`), `migration-roundtrip.test.ts`, `migrations.test.ts` — drive off the new single migration name.
4. **`bun run check`** green; `bun test src/db/` green.
5. **Flag destructive `db:reinit`** on dev + sibling worktrees before running (user said rewrite is ok, but confirm).

## Worktree & SCM Discipline

- Worktree `tree/db-migration-epoch-squash` (branch `db-migration-epoch-squash`).
- Commit via `agent-commit`, finalize via `finalize` (GPG + gates). GPG/pinentry failure → stop and report.

## Out of Scope (separate tickets — review only)

- **11 state-machine tickets** (`high`, `⬜ Not Started`) — app-layer + `COLUMN_TYPE_OVERRIDES` only, **no migration needed** (columns confirmed in fresh DDL). `HeatPhase` ticket stale (`normal/pre_heat/heat/post_heat` already exists). `NsfwEncounterStatus` already exists (`active→completed`), ticket wants an expansion. Annotation committed in `fee99982`.

## Acceptance Criteria

- [ ] Single final-form migration (pure CREATE); 78 superseded files + orphan `parts/009` removed.
- [ ] Fresh DB: `migrateToLatest` applies; final `.schema` byte-identical to normalized fresh-DDL dump.
- [ ] `db:sync-types` + `db:sync-manifest` zero diff; `schemas:check` green.
- [ ] Migration-coupled tests rewritten and green; full `bun test src/db/` green.
- [ ] `bun run check` green.
- [ ] Worktree finalized via `scripts/worktree/ finalize` (GPG-signed).