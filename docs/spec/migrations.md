<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Database Migrations

Source of truth for schema changes. Authoritative implementation: `src/db/migrations/` and `src/db/migrate.ts`.

## Layout

- `src/db/migrations/001_core.ts` … `014_support_singletons.ts` — the 14-file S2 baseline: one final-form `.createTable` per table, inline Kysely DSL only, raw SQL for indexes/triggers/FTS.
- `src/db/migrations/NNN_name.ts` — future appends; `015_*` and `016_*` are shipped, so the next free number is `017_*`.
- `src/db/migrate.ts` — runs the Migrator plus `assertMigrationsNotStale`, which fails fast when an applied migration no longer exists on disk; local DBs are disposable (export → `db:reinit` → import).
- `src/db/data-migrations/` — row-level data transforms with their own runner (see its README).

## Baseline and append-only policy

The 14 pre-release baseline files are immutable; their `kysely_migration` rows are not preserved on existing local DBs. New migrations are append-only: never delete, rename or renumber a shipped file; extend only the current unshipped HEAD. No `parts/` subdirectory. Full policy: `src/db/migrations/README.md`.

## After any migration change

```bash
bun run db:sync-types && bun run db:sync-manifest
bun run schemas:check
bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts
```

Generated from migrations (never hand-edit): `src/db/schema-*.ts`, `src/db/schema.ts`, `src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`, `src/validation/db-schemas.ts`.

## Related epics

- `epic-db-content-versioning.md`
