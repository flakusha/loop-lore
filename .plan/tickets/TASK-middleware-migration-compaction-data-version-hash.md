# TASK: Migration compaction, optimization, content data_version + record_hash

**Status:** ⬜ Open
**Priority:** high
**Effort:** large
**Epic:** epic-content-hashing-distributed-integrity (cross-cuts with `epic-db-content-versioning`)
**Issue:** TBD
**Related:**
- `src/db/migrations/` (67 migrations on dev; the half-broken 016 + the new 067 are precedents)
- `src/db/migrations/026_rpg_mechanics.ts` (`character_stats.data_version` — working precedent)
- `src/db/schema.ts`, `schema-manifest.ts`, `schema-core.ts` (auto-generated)
- `src/test-utils/insert-helpers.ts` (auto-generated)
- `src/validation/db-schemas.ts` (auto-generated)
- `epic-db-content-versioning.md` (FEA-2026-040..044)
- `TASK-middleware-fe-be-db-record-content-hashing.md` (defines `record_hash` envelope)

## Summary

The DB has accumulated **67 migrations** on dev, several of which are
half-implemented (e.g. `016_asset_encryption.ts` drops `content_hash`
in `down()`), are redundant, or have grown unwieldy. This ticket:

1. Compacts redundant migrations into consolidated forward-only steps
   (no rewrite of history — only new forward migrations that achieve
   the same end state with fewer files).
2. Optimizes the migration hot path so new installs don't replay 67
   files when a single CREATE TABLE would do.
3. Standardizes a **`data_version` integer + `record_hash` text** pair
   on every content-bearing table (`assets`, `messages`, `characters`,
   `request_results`, `chats`, `worlds`).
4. Adds a **content versioning registry** (`src/db/content-version.ts`)
   that maps `(table, data_version) → (column_projection, migration_fn)`
   so a batch runner can refresh hashes after a column add.

This is the structural foundation that tickets 4 and 5 lean on.

## Schema additions (new migration `0xx_data_version_record_hash.ts`)

For each of `assets`, `messages`, `characters`, `request_results`,
`chats`, `worlds`:

```sql
ALTER TABLE <t> ADD COLUMN data_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE <t> ADD COLUMN record_hash   TEXT    NOT NULL DEFAULT '';
CREATE INDEX idx_<t>_record_hash ON <t>(record_hash);
```

`data_version` is bumped by a service-layer hook when tracked columns
change. `record_hash` is computed by the same hook (see ticket 1).

## Compaction rules

The new forward-only compaction migration:

- [ ] Drops **unused** indexes surfaced by `EXPLAIN QUERY PLAN` analysis
  (only those with `SCAN` cost > 5x the alternative). Document the
  deletions in `docs/spec/migrations.md`.
- [ ] Coalesces **adjacent ALTER TABLE statements on the same table**
  into single ALTER TABLE statements where SQLite allows (SQLite does
  NOT allow merging all of them — coalesce only the ones that don't
  conflict with column defaults).
- [ ] Adds the **`PRAGMA foreign_keys = ON`** enforcement at the start
  of every test fixture (currently a one-off in
  `src/test-utils/insert-helpers.ts`).
- [ ] Replaces the broken `016_asset_encryption.down()` by adding a new
  forward migration that re-adds the column if missing; the old `down()`
  stays for history but is documented as broken in
  `docs/spec/migrations.md`.

## Optimization rules

- [ ] **Statement cache**: cache the prepared SQL for the most common
  migrations (CREATE TABLE, ALTER TABLE ADD COLUMN) so re-installs on
  the same schema version don't re-prepare.
- [ ] **Batch index creation**: when a migration adds multiple indexes
  on the same table, use a single `CREATE INDEX` block per file
  (already standard; double-check).
- [ ] **Skip-on-already-applied**: every migration must be idempotent
  on `IF NOT EXISTS` (most are; audit + fix).

## Content versioning registry

- [ ] New `src/db/content-version.ts` exports:
  - `registerContentVersion(table, dataVersion, columns)` — declare
    which columns participate in the envelope for `(table, v)`.
  - `getContentEnvelope(table, row)` — build the canonical JSON
    envelope (sorted keys, no whitespace) for a row.
  - `runBatchRefresh(database, table, opts)` — recompute
    `record_hash` for every row whose tracked columns changed.
- [ ] Migrations that add a tracked column MUST call `registerContentVersion`
  in `up()` and increment `data_version` on existing rows. The
  `bun run db:sync-manifest` step picks up the registration.
- [ ] Unit tests in `src/db/content-version.test.ts`:
  - registration is idempotent on duplicate (table, v) pairs,
  - envelope is canonical across key orderings,
  - batch refresh updates `record_hash` on affected rows only.

## Acceptance Criteria

- [ ] `bun run db:migrate:fresh` on a clean SQLite file applies all
  migrations to a usable schema without error. The wall-clock duration
  is recorded qualitatively (e.g. 'fast' / 'slow') in the ticket's
  resolution notes at close-time, NOT as a number in the AC (per
  `AGENTS.md` rule against stale quantitative metrics in docs).
- [ ] `bun run db:migrate:up` and `bun run db:migrate:down` cleanly
  cycle on `:memory:` SQLite.
- [ ] `bun run schemas:check` green; regenerated artifacts compile.
- [ ] `docs/spec/migrations.md` documents the compaction deletions
  with file + line references and the rationale for each.
- [ ] Every content-bearing table carries `data_version` + `record_hash`
  columns with the index.
- [ ] `epic-db-content-versioning.md` sub-feature FEA-2026-042 (Content
  versioning framework) and FEA-2026-041 (Migration reconciliation)
  checkboxes are checked when this ticket closes.

## Tests

- `bun test src/db/content-version.test.ts` — 3 cases above.
- `bun test src/db/migrations.test.ts` — full up/down cycle on
  `:memory:` SQLite for every migration.
- `bun run check` green.

## Out of Scope

- Postgres-specific optimizations (parallel index creation,
  partitioning). SQLite portable code is the priority.
- Backfill of `data_version` + `record_hash` for existing rows (separate
  ticket — touches every content-bearing table; large blast radius).
- Migration tooling rewrite (Kysely migrator is fine; only forward-only
  files are added).

## Notes

- **Compaction is forward-only.** We never edit a checked-in migration
  file. New migrations consolidate. This preserves the audit trail
  while reducing the per-install cost.
- `data_version` is an **integer** (matches `character_stats` precedent).
  Do NOT switch to `semver` strings; the registry is keyed on integers
  and the batch runner is fast.
- `record_hash` lives on the row, not in a side table. Cross-row
  reconciliation uses the index. This keeps the hot path single-table.
- The compaction migrations are intentionally small (one concern per
  file) so future agents can re-compact cleanly. Resist the urge to
  put everything in one mega-migration.
