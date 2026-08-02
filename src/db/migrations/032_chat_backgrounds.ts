/**
 * Chat Backgrounds — Location Scope + Assignment — DB Schema
 *
 * Immersive chat backgrounds synced to the world/location system.
 * `chat_backgrounds` is the catalog of location-scoped (or global) background
 * assets; `chat_background_assignments` records which background is active for a
 * given chat (one per chat — the currently resolved background).
 *
 * Auto-sync contract: when a chat's `current_location_id` changes, the backend
 * resolves the highest-priority background whose `location_id` matches and
 * updates the chat's assignment (see routes/chat-backgrounds.ts
 * `autoSyncChatBackground`). A chat may also bind a background explicitly,
 * bypassing location resolution.
 *
 * `chat_sections.background_id` lets individual sections override the chat-level
 * background; it is added here after the backgrounds table exists.
 *
 * See .plan/tickets/TASK-chat-backgrounds-location-sync.md.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("chat_backgrounds",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.notNull().defaultTo("static",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("config", "text",)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  // Chat -> active background (at most one per chat).
  await db.schema
    .createTable("chat_background_assignments",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",).notNull(),)
    .addColumn(
      "background_id",
      "text",
      (col,) => col.references("chat_backgrounds.id",).onDelete("cascade",).notNull(),
    )
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  await db.schema
    .createIndex("chat_background_assignments_chat_idx",)
    .on("chat_background_assignments",)
    .columns(["chat_id",],)
    .unique()
    .execute();

  // Section-level background override on top of the (now-existing) backgrounds table.
  await db.schema
    .alterTable("chat_sections",)
    .addColumn("background_id", "text", (col,) => col.references("chat_backgrounds.id",).onDelete("set null",),)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("chat_sections",).dropColumn("background_id",).execute();
  await db.schema.dropIndex("chat_background_assignments_chat_idx",).execute();
  await db.schema.dropTable("chat_background_assignments",).execute();
  await db.schema.dropTable("chat_backgrounds",).execute();
}
