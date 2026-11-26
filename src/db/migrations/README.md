# Database Migrations

Schema migrations are top-level `NNN_name.ts` files auto-discovered by
`getMigrationFiles()` in `src/db/migrate.ts`; each exports `up(db)` and
`down(db)`. `kysely_migration` holds one row per applied migration.

## Baseline Policy (S2)

`001_core.ts` through `014_support_singletons.ts` are the pre-release
baseline: one final-form `.createTable("t",)…execute()` per table, with
inline Kysely DSL only. No helper functions, loops or imported fragments —
the textual migration parser needs literal `createTable`/`addColumn` calls
inside `up()` and silently drops columns it cannot parse.

Existing local databases are disposable under S2: export what you need,
reinitialize (`db:reinit`), then import. There is no compatibility shim for
the retired 122-file chain and no expectation that its `kysely_migration`
rows survive. `src/db/migrate.ts` still fails fast when applied migration
names are missing; recreate the local DB rather than restoring old files.

New migrations appended after the baseline are append-only: never delete,
rename, renumber or rewrite one that has shipped. Add a new forward
migration instead. Extend only the current unshipped HEAD migration.

## Structure Rules

- One `ADD COLUMN` / `DROP COLUMN` per `alterTable` statement — SQLite does
  not support multi-column ALTER TABLE.
- Baseline files use inline DSL only; raw `sql` carries indexes, triggers,
  FTS virtual tables and the retained backfill oracles.

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
