import type { Kysely, } from "kysely";

/**
 * Migration 028 — GM Shadow Notes & Whitenotes
 *
 * Adds two new tables for GM narrative tools:
 * - `shadow_notes`: hidden narrative influences (foreshadowing, consequences, etc.)
 * - `whitenotes`: visible narrative directives (direction, tone, pacing, etc.)
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("shadow_notes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("hidden",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_shadow_notes_chat_id",)
    .on("shadow_notes",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createTable("whitenotes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(5,),)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("scene",),)
    .addColumn("expires_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_whitenotes_chat_id",)
    .on("whitenotes",)
    .column("chat_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("whitenotes",).execute();
  await database.schema.dropTable("shadow_notes",).execute();
}
