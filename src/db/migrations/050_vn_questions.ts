// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 050_vn_questions
 *
 * VN Q&A interaction loop storage — the question cards a scene surfaces and
 * the single answer the player picks. Modelled on `vn_choices` (001_init):
 * same impact columns, same available/answered lifecycle, same chat cascade.
 *
 * `speaker_id` deliberately carries NO foreign key: the asker is an actor the
 * VN renderer may reference before an `actors` row exists.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("vn_questions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_index", "integer", (col,) => col.notNull(),)
    .addColumn("question_type", "text", (col,) => col.notNull().defaultTo("lore",),)
    .addColumn("question_text", "text", (col,) => col.notNull(),)
    // No FK by design — see header.
    .addColumn("speaker_id", "text",)
    .addColumn("options", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("next_scene_id", "text",)
    .addColumn("consequences", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("relationship_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("mood_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("available",),)
    .addColumn("selected_option_id", "text",)
    .addColumn("answered_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_vn_questions_chat_id",)
    .on("vn_questions",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_vn_questions_scene",)
    .on("vn_questions",)
    .columns(["chat_id", "scene_index",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("vn_questions",).execute();
}
