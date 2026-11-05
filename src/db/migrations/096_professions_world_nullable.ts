// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 096_professions_world_nullable — step 2 (world_id becomes nullable)
 *
 * Runtime: drop the standalone unique index (095 moved the constraint out of
 * the table so this is possible), re-issue `world_id` without `notNull()`
 * (SQLite DROP COLUMN would otherwise be blocked — the drop is only a
 * vehicle for the nullability change; the table had no writers before
 * ProfessionsService, verified against every non-test reference), restore
 * the index. Why `professions` may be world-less: config-seeded character
 * templates carry disciplines before any world exists (see 095's header).
 *
 * Generators: this is the migration the schema generators model — a drop of
 * `world_id` followed by a re-add without `notNull()`; the generators apply
 * re-adds over drops, so the generated `Professions.world_id` is
 * `string | null` and matches the real database.
 *
 * Unique-constraint note: SQLite UNIQUE treats NULLs as distinct, so the
 * restored index no longer dedupes world-less rows — the service's
 * create-time discipline-duplicate check is the enforcement point.
 *
 * Known-numbering note: see 095 (formerly 094; lorebook-inclusion-groups
 * collision; renumbered at finalize).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_profession_actor_world_discipline`.execute(database,);

  await database.schema.alterTable("professions",)
    .dropColumn("world_id",)
    .execute();

  await database.schema.alterTable("professions",)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .execute();

  await sql`
    CREATE UNIQUE INDEX uq_profession_actor_world_discipline
    ON professions (actor_id, world_id, discipline)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX uq_profession_actor_world_discipline`.execute(database,);

  await database.schema.alterTable("professions",)
    .dropColumn("world_id",)
    .execute();

  // NOT NULL without a default is only addable to an empty table — the
  // restored shape accepts no world-less rows, which is the pre-096 contract.
  await database.schema.alterTable("professions",)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .execute();

  await sql`
    CREATE UNIQUE INDEX uq_profession_actor_world_discipline
    ON professions (actor_id, world_id, discipline)
  `.execute(database,);
}
