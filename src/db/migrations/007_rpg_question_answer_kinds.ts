// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 007_rpg_question_answer_kinds
 *
 * TASK-029 gaps: extends `rpg_questions` beyond plain multiple choice.
 * - `input_kind`: how the player answers (choice | free_text | numeric).
 * - `answer_value`: raw answer for free_text/numeric questions.
 * - `min_value` / `max_value`: optional inclusive bounds for numeric input.
 * - `effect`: JSON side effects applied on answer
 *   (`{ quest?: { questId, progressDelta?, complete? }, grantItemId?: string }`).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("rpg_questions",)
    .addColumn("input_kind", "text", (col,) => col.notNull().defaultTo("choice",),)
    .execute();
  await database.schema
    .alterTable("rpg_questions",)
    .addColumn("answer_value", "text",)
    .execute();
  await database.schema
    .alterTable("rpg_questions",)
    .addColumn("min_value", "integer",)
    .execute();
  await database.schema
    .alterTable("rpg_questions",)
    .addColumn("max_value", "integer",)
    .execute();
  await database.schema
    .alterTable("rpg_questions",)
    .addColumn("effect", "text", (col,) => col.notNull().defaultTo("{}",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("rpg_questions",).dropColumn("effect",).execute();
  await database.schema.alterTable("rpg_questions",).dropColumn("max_value",).execute();
  await database.schema.alterTable("rpg_questions",).dropColumn("min_value",).execute();
  await database.schema.alterTable("rpg_questions",).dropColumn("answer_value",).execute();
  await database.schema.alterTable("rpg_questions",).dropColumn("input_kind",).execute();
}
