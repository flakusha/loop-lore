# TASK: Runtime migration staleness guard

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium
**Related:** TASK-data-migrations-atomicity-and-concurrency-guard

## Summary

Fail-fast guard comparing applied vs committed migrations; a78a2a4f deleted+renumbered migrations breaks existing DBs.

## Context

- `src/db/migrate.ts` scans `src/db/migrations/` and feeds Kysely `Migrator`. Kysely throws when `kysely_migration` contains names absent from the provider.
- Commit `a78a2a4f` deleted (`007_difficulty_reroll_default`, `008_schema_constraints`, `027_gm_config_visual_novel`) and renumbered migrations (`012`–`031`). Any DB migrated against the old numbering fails on next `db:migrate` with an opaque Kysely "missing migration" error and no recovery hint.
- `scripts/check-db-schemas.ts` (the `check` gate) only diffs *generated artifacts* against migration source — it never inspects a runtime DB, so it cannot catch this.
- Same risk class applies to `src/db/data-migrations/`: deleting a data migration dir orphans `data_migrations` rows (currently handled silently).

## Acceptance Criteria

- [ ] After loading migrations, compare provider names against the applied set in `kysely_migration`; on divergence, throw a clear error listing the missing/renamed migrations and the recovery command (`db:reinit`)
- [ ] Error message appears before any schema DDL runs (fail-fast)
- [ ] Unit tests: fresh DB passes; DB with an unknown applied migration fails with the actionable message
- [ ] Document policy in `src/db/migrations/README` (or equivalent): applied migrations are append-only — never delete or renumber once shipped
- [ ] `bun run check` and `bun test src/` stay green
