import type { Kysely, } from "kysely";

/**
 * Migration 029 — Visual Novel Branching Choices
 *
 * Adds tables for VN mode branching choices:
 * - `vn_choices`: available choices per scene
 * - `vn_choice_selections`: user selections (history)
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("vn_choices",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_index", "integer", (col,) => col.notNull(),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("consequences", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("relationship_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("mood_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("unlock_conditions", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("selected", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("selected_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_vn_choices_chat_id",)
    .on("vn_choices",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_vn_choices_scene",)
    .on("vn_choices",)
    .columns(["chat_id", "scene_index",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("vn_choices",).execute();
}
