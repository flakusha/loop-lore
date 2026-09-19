// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG chat questions (TASK-029 question-based gameplay slice).
 *
 * `rpg_questions` stores structured multiple-choice questions attached to a
 * chat. Options live in a JSON column ({id, text} array); answering records
 * the chosen option and flips the row to `answered`. Time-limited questions
 * may expire via `time_limit` seconds.
 *
 * Top-level (not a `001_init` part): `001_init.ts` is frozen. New top-level
 * migrations are auto-discovered by `getMigrationFiles()` (sorted by name).
 * Numbered 016: dev ships 013_locations_fractal (schema version 34),
 * 014_asset_thumbnail (schema version 33), and 015_avatar_focus (schema
 * version 33), so the original 013 number would collide in prefix and
 * version.
 */
import { type Kysely, sql, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("rpg_questions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("prompt", "text", (col,) => col.notNull(),)
    .addColumn("options", "text", (col,) => col.notNull(),)
    .addColumn("time_limit", "integer",)
    .addColumn("required_choice", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("open",),)
    .addColumn("selected_option_id", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("answered_at", "text",)
    .execute();

  await database.schema
    .createIndex("idx_rpg_questions_chat_status",)
    .on("rpg_questions",)
    .columns(["chat_id", "status",],)
    .execute();

  await recordSchemaVersion(database, 36, "rpg chat questions",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("rpg_questions",).execute();
}
