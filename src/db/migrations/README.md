# Database Migrations

Schema migrations are top-level `NNN_name.ts` files auto-discovered by
`getMigrationFiles()` in `src/db/migrate.ts`; each exports `up(db)` and
`down(db)`. `kysely_migration` holds one row per file (`001_init`, …).

`001_init.ts` is **frozen**: it orchestrates the historical `parts/` tree
(001–016, 018, 019, 021; 017/020 retired) and must gain no new parts —
Kysely tracks `001_init` as one unit, so appended parts silently skip on
existing databases (the drift class `runSchemaBackfill` converges at boot).
New schema changes go in as new top-level `NNN_name.ts` files, which
Kysely applies exactly once per database. A test in
`src/db/migrations.test.ts` ("001_init part freeze") fails if a part is
added to `001_init.ts`.

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
- Data (row-level) migrations live in `src/db/data-migrations/` (runner +
  types; discovery-based, no registry to edit). No row migrations ship
  currently — the unshipped v1_to_v2 baselines were folded.

## Regeneration

Migrations are the source of truth for the DB schema. After adding/editing a
migration, regenerate the derived artifacts:

```bash
bun run db:sync-types && bun run db:sync-manifest
bun run schemas:check
```

## Agent Workflow

When a ticket requires schema changes:

1. **Ask the user first**: new top-level migration (`NNN_*.ts`) vs. fold into
   an existing unshipped file. Never append a part to `001_init.ts` (frozen —
   the tripwire test fails) and never extend a shipped migration.
2. Create `src/db/migrations/NNN_description.ts`, export `up`/`down`, and
   call `recordSchemaVersion(db, NNN, "label")` from `up()`. It is
   auto-discovered by `getMigrationFiles()` — no wiring step.
3. Run the regeneration chain: `bun run db:sync-types && bun run db:sync-manifest`
   then `bun run schemas:check`.
4. Verify the migration chain + roundtrip:
   `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`.
5. Run `bun run check` to verify all gates.
6. If a `.plan/tickets/` file was edited, run `bun run plan:sync:fix` to
   reconcile the ticket index.
