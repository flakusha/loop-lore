import type { Kysely, } from "kysely";
import { sql, } from "kysely";

/**
 * Migration 008 — Chat features: pinning, personas, impersonation
 *
 * Adds:
 * - `is_pinned` on `chats`: user-surface favorite chats
 * - `personas` table: user-authored identities for chat participation
 * - `impersonate_actor_id` on `chat_participants`: which character a user plays
 * - `persona_id` on `chat_participants`: user's persona for this chat
 *
 * Design: Integer flag (0/1) for is_pinned to match existing boolean-as-number
 * convention (actor_notes.pinned, actor_items.equipped). Per-participant
 * impersonation/persona to support group chats.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("is_pinned", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema.createIndex("idx_chats_pinned",).on("chats",).column("is_pinned",).execute();

  await database.schema
    .createTable("personas",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("avatar_asset_id", "text", (col,) => col.references("assets.id",),)
    .addColumn("description", "text",)
    .addColumn("title", "text",)
    .addColumn("is_default", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema.createIndex("idx_personas_user_id",).on("personas",).column("user_id",).execute();
  await database.schema.createIndex("idx_personas_default",).on("personas",).column("user_id",).column("is_default",)
    .execute();

  await database.schema.alterTable("chat_participants",).addColumn(
    "impersonate_actor_id",
    "text",
    (col,) => col.references("actors.id",),
  ).execute();

  await database.schema.alterTable("chat_participants",).addColumn(
    "persona_id",
    "text",
    (col,) => col.references("personas.id",),
  ).execute();

  await database.schema.createIndex("idx_chat_participants_impersonate",).on("chat_participants",).column(
    "impersonate_actor_id",
  ).execute();

  await database.schema.createIndex("idx_chat_participants_persona",).on("chat_participants",).column("persona_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_chat_participants_persona",).execute();
  await database.schema.dropIndex("idx_chat_participants_impersonate",).execute();
  await database.schema.alterTable("chat_participants",).dropColumn("persona_id",).execute();
  await database.schema.alterTable("chat_participants",).dropColumn("impersonate_actor_id",).execute();
  await database.schema.dropIndex("idx_personas_default",).execute();
  await database.schema.dropIndex("idx_personas_user_id",).execute();
  await database.schema.dropTable("personas",).execute();
  await database.schema.dropIndex("idx_chats_pinned",).execute();
  await database.schema.alterTable("chats",).dropColumn("is_pinned",).execute();
}
