# Database Migrations

Schema migrations live in **modular parts** under `parts/NNN_name.ts`. Each
part file exports `up(db)` and `down(db)`; `001_init.ts` orchestrates them —
it imports every part and runs `up()` in part order and `down()` in reverse.
Migration names recorded in `kysely_migration` are the part names
(`001_core`, `002_assets`, …). When adding a part, create
`parts/NNN_description.ts`, export `up`/`down`, and wire it into
`001_init.ts` in dependency order.

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
bun run schemas:check
```

## Agent Workflow

When a ticket requires schema changes:

1. **Ask the user first**: append a new part (`parts/NNN_*.ts`) vs. fold into
   an existing part. Shipped parts are append-only — extend one only when the
   new state hasn't been released.
2. Create the new part (or edit the unshipped part), export `up`/`down`, and
   wire it into `001_init.ts` in dependency order.
3. Run the regeneration chain: `bun run db:sync-types && bun run db:sync-manifest`
   then `bun run schemas:check`.
4. Verify the migration chain + roundtrip:
   `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`.
5. Run `bun run check` to verify all gates.
6. If a `.plan/tickets/` file was edited, run `bun run plan:sync:fix` to
   reconcile the ticket index.
