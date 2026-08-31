import { type Kysely, sql, } from "kysely";

/**
 * Migration 022 — Message reactions and chat pins
 *
 * Adds two interaction tables for chat messages:
 *
 * - `message_reactions`: per-message emoji reactions (toggle semantics).
 *   UNIQUE(message_id, user_id, emoji) enforces one reaction per user
 *   per emoji per message. CASCADE on message delete.
 *
 * - `chat_pins`: pinned messages bar at chat top. UNIQUE(chat_id,
 *   message_id) prevents duplicate pins. Max 3 enforced in application
 *   code, not DB constraint.
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── message_reactions ──────────────────────────────────────
  await database.schema
    .createTable("message_reactions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("emoji", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_reactions_message",)
    .on("message_reactions",)
    .column("message_id",)
    .execute();

  await database.schema
    .createIndex("idx_reactions_user",)
    .on("message_reactions",)
    .column("user_id",)
    .execute();

  // ── chat_pins ──────────────────────────────────────────────
  await database.schema
    .createTable("chat_pins",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("pinned_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("pinned_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_pins_chat",)
    .on("chat_pins",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_pins_message",)
    .on("chat_pins",)
    .column("message_id",)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("chat_pins",).ifExists().execute();
  await database.schema.dropTable("message_reactions",).ifExists().execute();
}
