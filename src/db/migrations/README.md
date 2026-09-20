# Database Migrations

Schema migrations are top-level `NNN_name.ts` files auto-discovered by
`getMigrationFiles()` in `src/db/migrate.ts`; each exports `up(db)` and
`down(db)`. `kysely_migration` holds one row per applied migration.

## Append-Only Policy

Applied migrations are append-only. Once a migration ships, never:

- delete it
- rename it (the filename is the identity stored in `kysely_migration`)
- renumber it (inserts/suffixes are fine; renumbering orphans the old rows)
- rewrite it to change what a committed database already ran

Deleting/renumbering a shipped migration orphans its `kysely_migration` row.
`src/db/migrate.ts` detects this at startup via `assertMigrationsNotStale`
and fails fast with the list of missing migrations plus recovery options
(restore from git, recreate the DB, or manually clean the orphaned rows).

To change schema behavior for an existing migration, add a new forward
migration that alters the schema to the desired state.

## Two Paths for New Schema Changes

There are only two ways to land a schema change:

1. **Append a new top-level migration** — `src/db/migrations/NNN_name.ts`,
   exporting `up(db)` and `down(db)`. Auto-discovered by
   `getMigrationFiles()` — no wiring step. This is the default.

2. **Extend the current HEAD migration** — when the latest migration is not
   yet shipped (no DB has run it), append changes to its `up`/`down`. This
   avoids polluting `kysely_migration` with multiple rows for the same
   logical change.

There is no third path. There is no `parts/` subdirectory, no folding into a
frozen base migration, and no append-only-via-extend for shipped files.

## Structure Rules

- One `ADD COLUMN` / `DROP COLUMN` per `alterTable` statement — SQLite does
  not support multi-column ALTER TABLE.

## Regeneration

Migrations are the source of truth for the DB schema. After adding/editing a
migration, regenerate the derived artifacts:

```bash
bun run db:sync-types && bun run db:sync-manifest
bun run schemas:check
```

## Agent Workflow

When a ticket requires schema changes:

1. Pick the path: append a new `NNN_*.ts` migration (default) or extend the
   current HEAD migration (only if not yet shipped).
2. Create `src/db/migrations/NNN_description.ts`, export `up`/`down`.
3. Run the regeneration chain: `bun run db:sync-types && bun run db:sync-manifest`
   then `bun run schemas:check`.
4. Verify the migration chain + roundtrip:
   `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`.
5. Run `bun run check` to verify all gates.
6. If a `.plan/tickets/` file was edited, run `bun run plan:sync:fix` to
   reconcile the ticket index.
