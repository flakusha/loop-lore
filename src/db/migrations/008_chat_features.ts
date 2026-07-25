import type { Kysely, } from "kysely";
import { sql, } from "kysely";

/**
 * Migration 008 — Chat features: pinning, personas, impersonation, archiving
 *
 * Adds:
 * - `is_pinned` on `chats`: "unpinned"/"pinned" enum
 * - `personas` table with `is_default`: "not_default"/"default" enum
 * - `impersonate_actor_id` on `chat_participants`: which character a user plays
 * - `persona_id` on `chat_participants`: user's persona for this chat
 * - `archived_at` on `messages`: soft-delete with 30-day restore window
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("is_pinned", "text", (col,) => col.notNull().defaultTo("unpinned",),)
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
    .addColumn("is_default", "text", (col,) => col.notNull().defaultTo("not_default",),)
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

  // ── Message archiving ──────────────────────────────────
  await database.schema
    .alterTable("messages",)
    .addColumn("archived_at", "text",)
    .execute();

  await database.schema
    .createIndex("idx_messages_archived",)
    .on("messages",)
    .column("archived_at",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_messages_archived",).execute();
  await database.schema.alterTable("messages",).dropColumn("archived_at",).execute();

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
