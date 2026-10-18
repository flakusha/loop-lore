// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 063_vn_choice_selections
 *
 * Choice-history table for VN branching choices plus the applied-at stamp for
 * consequence write-back. `selectVnChoice` records one row per selection and
 * `applyVnImpacts` stamps `applied_at` once the accumulated
 * relationship/mood impacts have been written to the character systems.
 *
 * `selected_by` deliberately carries NO foreign key: the selecting user's
 * actor may be referenced before an `actors` row exists (mirrors the
 * `speaker_id` rationale in 050_vn_questions).
 *
 * `vn_questions.applied_at` gives question answers the same observable
 * applied/unapplied state the selections table carries for choices.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("vn_choice_selections",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("choice_id", "text", (col,) => col.notNull().unique().references("vn_choices.id",).onDelete("cascade",),)
    .addColumn("scene_index", "integer", (col,) => col.notNull(),)
    .addColumn("relationship_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("mood_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    // No FK by design — see header.
    .addColumn("selected_by", "text",)
    .addColumn("applied_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_vn_choice_selections_chat_id",)
    .on("vn_choice_selections",)
    .column("chat_id",)
    .execute();

  await database.schema
    .alterTable("vn_questions",)
    .addColumn("applied_at", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("vn_choice_selections",).execute();
  await database.schema
    .alterTable("vn_questions",)
    .dropColumn("applied_at",)
    .execute();
}
