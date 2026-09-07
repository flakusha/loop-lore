<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Database Migrations

Source of truth for schema changes. Authoritative implementation: `src/db/migrations/` and `src/db/migrate.ts`.

## Layout

- `src/db/migrations/001_init.ts` — sole Kysely migration; orchestrates every part in order (`up`) and reverse (`down`).
- `src/db/migrations/parts/NNN_name.ts` — modular parts, each exporting `up(db)` / `down(db)`.
- `src/db/migrate.ts` — runs the Migrator plus `assertMigrationsNotStale`, which fails fast when an applied migration no longer exists on disk.
- `src/db/data-migrations/` — row-level data transforms with their own runner (see its README).

## Parts index

| Part | File | Scope |
| ---- | ---- | ----- |
| 001 | `001_core.ts` | core tables |
| 002 | `002_assets.ts` | assets |
| 003 | `003_worlds.ts` | worlds |
| 004 | `004_actors.ts` | actors |
| 005 | `005_characters.ts` | characters |
| 006 | `006_chat.ts` | chat |
| 007 | `007_personas.ts` | personas |
| 008 | `008_story.ts` | story |
| 009 | `009_crafting.ts` | crafting |
| 010 | `010_progression.ts` | progression |
| 011 | `011_blog.ts` | blog |
| 012 | `012_memory.ts` | memory |
| 013 | `013_generation.ts` | generation |
| 014 | `014_moderation.ts` | moderation |
| 015 | `015_e2e.ts` | e2e helpers |
| 016 | `016_fts.ts` | full-text-search indexes |
| 017 | `017_drop_template_visual_novel.ts` | drops legacy template flag (backfilled into `gm_config`) |
| 018 | `018_schema_version.ts` | `schema_version` table + backfill |

## Schema version tracking

`schema_version(version INTEGER PRIMARY KEY, applied_at, description)` holds one row per part. App code reads it via `getSchemaVersion(db)` in `src/db/schema-version.ts` (returns `0` on pre-018 databases). New parts record themselves with `recordSchemaVersion(db, n, description)` from `up()`.

## Append-only policy

Applied migrations are never deleted, renamed, or renumbered. To change schema behavior, add a new forward part. Full policy: `src/db/migrations/README.md`.

## After any migration change

```bash
bun run db:sync-types && bun run db:sync-manifest
bun run schemas:check
bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts
```

Generated from migrations (never hand-edit): `src/db/schema-*.ts`, `src/db/schema.ts`, `src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`, `src/validation/db-schemas.ts`.

## Related epics

- `epic-db-content-versioning.md`
