// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 054: pending ASI budget on `character_stats`.
 *
 * The XP/leveling epic stages allocatable ability points as they are granted
 * (levels 4/8/12/16/19 per `src/rpg/xp/constants.ts` ASI_LEVELS) and spends
 * them through the ASI allocation API. The budget lives on the row it
 * belongs to: one integer counter, defaulted to 0 so every existing
 * character starts with nothing pending.
 */
import { type Kysely, } from "kysely";

/**
 * @param db
 * @returns {Promise<void>}
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("character_stats",)
    .addColumn("pending_asi", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
}

/**
 * @param db
 * @returns {Promise<void>}
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("character_stats",)
    .dropColumn("pending_asi",)
    .execute();
}
