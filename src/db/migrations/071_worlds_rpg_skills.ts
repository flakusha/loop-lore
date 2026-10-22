// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 071_worlds_rpg_skills — per-world `skills` mechanic flag.
 *
 * Adds `worlds.rpg_skills` (not null, default 0) alongside the existing
 * `rpg_dice`..`rpg_quests` columns. Backfills from `rpg_enabled` so worlds
 * that opted into RPG keep skills armed (creation parity).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_skills", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await sql`UPDATE worlds SET rpg_skills = rpg_enabled`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("worlds",).dropColumn("rpg_skills",).execute();
}
