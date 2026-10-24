<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Generated DB types mark every primary key as DB-generated, so an id-less INSERT type-checks and stores a NULL id

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

**Summary:**\n\nThe DB type generator wraps EVERY primary-key column in `Generated<...>`, which makes Kysely treat `id` as optional on insert. An INSERT that omits `id` type-checks, and SQLite stores NULL because a TEXT PRIMARY KEY without a DEFAULT accepts NULL.\n\n**Mechanism:**\n\n- `scripts/generate-db-types.ts:274-277` — `if (col.primaryKey || (col.hasDefault && col.notNull))` returns the `Generated<base>` wrapper. The `col.primaryKey` clause is the hole: the manifest records `primaryKey` and `hasDefault` as separate flags (`scripts/generate-schema-manifest.ts:129-133`), so the generator already knows a TEXT PK has no DEFAULT and still claims one.\n- `Generated<T>` is Kysely `ColumnType<T, T | undefined, T>`: the column becomes optional in the insert object, so `typecheck - backend` (BLOCKING) cannot see the omission. Typecheck is not a candidate guard here — the generated type makes the bug legal.\n- In SQLite a TEXT PRIMARY KEY is not a rowid alias, so it permits NULL: the row is stored with `id = NULL` and every later `WHERE id = ?` matches 0 rows.\n\n**Instances:**\n\n- `src/assistant/commands/create-entity-lore.ts:182-199` inserts `world_lore_entries` / `actor_lore_entries` without `id`; the row lands with `id = NULL` and the cooldown write-back `WHERE id = NULL` updates 0 rows forever (BUG-assistant-created-lore-entries-are-stored-with-a-null-id-so-).\n- The notification writer is the same class of defect on another table (BUG-appeal-reversal-notification-is-stored-with-a-null-id-which-).\n- Scope: every no-default TEXT PRIMARY KEY column listed in `src/db/schema-manifest.ts` (about 145 TEXT PK columns).\n\n**Smallest check — fix the GENERATOR, not the generated file.**\n\n`scripts/generate-db-types.ts:275` should emit `Generated<base>` only when the DB actually supplies the value — `col.hasDefault`, or the INTEGER PRIMARY KEY rowid alias (primaryKey with an integer type) — and must NOT wrap a no-default TEXT PK. Such a table then types as `id: string`, which makes `id` REQUIRED in the insert object. Regenerate with `bun run db:sync-types`; the committed `src/db/schema-*.ts` and `src/db/generated/db-types.ts` are artifacts of that generator and `scripts/check-db-schemas.ts` (the `db - schema gate`) keeps them honest. The insert sites that relied on the hole must be fixed in the same commit.\n\n**Why the type change beats a static scan:** a script that flags `.insertInto(<table>)` whose column list omits `id` for a no-default-PK table has to re-derive the table set, parse insert column lists, and carry its own diff scoping and allowlist. The type change reuses the existing BLOCKING `typecheck - backend` gate: no new script, no baseline, no allowlist, and the signal is exact because the compiler sees the whole table type.\n\n**Diff-scoped:** yes, by construction. Typecheck runs the whole project, but only a changed file can introduce an id-less insert, so the signal is naturally limited to the diff. No gate narrowing is required.\n\n**Blocking vs advisory:** blocking through the existing typecheck gate. The generator rule change and the insert-site fixes must land together or typecheck goes red repo-wide.\n\n**Effort:** M — one generator rule, one regeneration, the offending insert sites, and a regression test asserting that a no-default TEXT PK is typed `id: string` with no `Generated` wrapper.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
