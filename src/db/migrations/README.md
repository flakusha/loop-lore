# Database Migrations

Schema migrations live here as `NNN_name.ts`. Each file exports `up(db)` and
`down(db)`; the filename (without `.ts`) is the migration name stored in
`kysely_migration`.

## Append-Only Policy

**Applied migrations are append-only.** Once a migration ships, never:

- delete it
- rename it (the filename is the identity)
- renumber it (inserts/suffixes are fine; renumbering orphans the old rows)
- rewrite it to change what a committed database already ran

Deleting/renumbering a shipped migration orphans its `kysely_migration` row.
`src/db/migrate.ts` detects this at startup via `assertMigrationsNotStale`
and fails fast with the list of missing migrations plus recovery options
(restore from git, recreate the DB, or manually clean the orphaned rows).

To change schema behavior for an existing migration, add a new forward
migration that alters the schema to the desired state.

## Structure Rules

- One `ADD COLUMN` / `DROP COLUMN` per `alterTable` statement — SQLite does
  not support multi-column ALTER TABLE.
- Use `src/db/migration-helpers.ts` (`boolToEnum`, `batchBoolToEnum`) for
  boolean → text-enum conversions; helpers are transactional and log
  non-0/1 values instead of silently coercing them.
- Data (row-level) migrations live in `src/db/data-migrations/` with their
  own runner and versioning — see its README.

## Regeneration

Migrations are the source of truth for the DB schema. After adding/editing a
migration, regenerate the derived artifacts:

```bash
bun run db:sync-types && bun run db:sync-manifest
bun run db:schemas:check
```
