<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Database Migrations

Source of truth for schema changes. Authoritative implementation: `src/db/migrations/` and `src/db/migrate.ts`.

## Layout

- `src/db/migrations/001_init.ts` — sole Kysely migration (v0 collapse, ~4 600 lines, 154 tables + indexes + triggers). Single file is deliberate for now; see the TODO in its header for the planned per-domain split.
- `src/db/migrations/NNN_name.ts` — future appends, sequential from `002_*` (old pre-collapse numbers are dead, do not skip ahead).
- `src/db/migrate.ts` — runs the Migrator plus `assertMigrationsNotStale`, which fails fast when an applied migration no longer exists on disk.
- `src/db/data-migrations/` — row-level data transforms with their own runner (see its README).

## Append-only policy

Applied migrations are never deleted, renamed, or renumbered. Two paths for new schema changes: (1) append a new top-level `NNN_*.ts` migration (default); (2) extend the current HEAD migration if it is not yet shipped. No `parts/` subdirectory, no folding into a frozen base migration. Full policy: `src/db/migrations/README.md`.

## After any migration change

```bash
bun run db:sync-types && bun run db:sync-manifest
bun run schemas:check
bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts
```

Generated from migrations (never hand-edit): `src/db/schema-*.ts`, `src/db/schema.ts`, `src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`, `src/validation/db-schemas.ts`.

## Related epics

- `epic-db-content-versioning.md`
