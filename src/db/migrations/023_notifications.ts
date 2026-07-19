import type { Kysely, } from "kysely";
import { sql, } from "kysely";

/**
 * Migration 023 — Notifications
 *
 * Adds the `notifications` table backing the per-user notification system
 * (in-app bell, dropdown, prompt injection). Per-user preferences live in
 * the existing `users.settings` JSON blob (key `notifications`), so no
 * separate preferences table is needed.
 *
 * Design decisions:
 * - `read` is INTEGER (0/1), not a boolean flag, to stay consistent with the
 *   existing `message_reactions`/`chat_pins` pattern and allow future
 *   soft-delete states without a schema change.
 * - Composite index `(user_id, read, created_at)` serves the two hot queries:
 *   unread-count and newest-first list.
 * - `data` is a JSON payload for type-specific context (e.g. message id).
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("notifications",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("body", "text",)
    .addColumn("link", "text",)
    .addColumn("read", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("data", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_notifications_user_read",)
    .on("notifications",)
    .columns(["user_id", "read", "created_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_notifications_user_read",).execute();
  await database.schema.dropTable("notifications",).execute();
}
