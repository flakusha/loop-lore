// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 094_professions_world_optional — step 1 (constraint out of the table)
 *
 * `professions.world_id` is NOT NULL with an FK to `worlds.id`
 * (001_init, parts/009-crafting) — but professions exist independently of any
 * world: config-seeded character templates carry a discipline baseline before
 * any world is chosen, and `character_skills.world_id` (the sibling RPG
 * progression table) is nullable. Forcing template seeds into a sentinel
 * world id would either violate the FK or fake a row in `worlds`.
 *
 * SQLite cannot ALTER nullability, and DROP COLUMN refuses while the column
 * sits inside the table-level UNIQUE constraint (verified empirically — a
 * separate UNIQUE index blocks it too). Step 1 therefore rebuilds the table
 * with the identical shape, replacing the table-level
 * `uq_profession_actor_world_discipline` CONSTRAINT with an equivalent
 * standalone UNIQUE index; step 2 (`095_professions_world_nullable`) then
 * drops that index, re-issues `world_id` without `notNull()`, and restores
 * the index — a pair the schema generators model correctly (a re-added
 * column wins over its drop), so the generated `Professions` interface
 * reflects the nullable reality (the `022`+`023` prompt_templates precedent:
 * rebuild migrations are invisible to the generators, so the shape change
 * lands as builder alters).
 *
 * Copy note: the table had no writers before ProfessionsService (verified:
 * only schema/migration/lore-read references), so the copy is a formality —
 * it still runs so the migration is honest for databases that wrote rows.
 *
 * Known-numbering risk: 094/095 are also claimed by the unfinalized
 * lorebook-inclusion-groups branch (its 094); the loser of the finalize race
 * is renumbered at rebase (established renumber process).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema.createTable("professions_v2",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("discipline", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("experience", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("title", "text", (col,) => col.notNull().defaultTo("apprentice",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await sql`
    INSERT INTO professions_v2
      (id, actor_id, world_id, discipline, level, experience, title, created_at, updated_at)
    SELECT id, actor_id, world_id, discipline, level, experience, title, created_at, updated_at
    FROM professions
  `.execute(database,);

  await sql`DROP TABLE professions`.execute(database,);
  await database.schema.alterTable("professions_v2",).renameTo("professions",).execute();

  await sql`
    CREATE UNIQUE INDEX uq_profession_actor_world_discipline
    ON professions (actor_id, world_id, discipline)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_profession_actor_world_discipline`.execute(database,);
  await database.schema.dropTable("professions",).execute();

  // Restores the 001 shape verbatim (table-level UNIQUE constraint back).
  await database.schema.createTable("professions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("discipline", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("experience", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("title", "text", (col,) => col.notNull().defaultTo("apprentice",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_profession_actor_world_discipline", ["actor_id", "world_id", "discipline",],)
    .execute();
}
