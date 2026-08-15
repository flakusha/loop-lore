/**
 * Chat Location Events — Append-Only Location-Change Log — DB Schema
 *
 * Immutable event log recording every location change in a chat. Each row
 * captures the transition from one location to another (or to/from null),
 * who/what triggered it, and the message that caused it.
 *
 * Enables chat re-reads / going back in history by providing a complete travel
 * path that can be replayed. Without this table, `chats.current_location_id`
 * is a lossy scalar (each change overwrites the last, history is lost).
 *
 * `from_location_id` is nullable because a chat may start with no location;
 * `to_location_id` is nullable because location may be explicitly cleared.
 * `triggering_message_id` is nullable because manual location changes via the
 * PUT endpoint don't always correspond to a specific message.
 *
 * See .plan/tickets/TASK-chat-location-change-event-log.md.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("chat_location_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",).notNull(),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("from_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("to_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("triggering_message_id", "text", (col,) => col.references("messages.id",).onDelete("set null",),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  // Ordered per-chat history replay (chronological).
  await db.schema
    .createIndex("chat_location_events_chat_created_idx",)
    .on("chat_location_events",)
    .columns(["chat_id", "created_at",],)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("chat_location_events_chat_created_idx",).execute();
  await db.schema.dropTable("chat_location_events",).execute();
}