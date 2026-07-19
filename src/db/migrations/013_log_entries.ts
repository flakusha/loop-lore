import { type Kysely, sql } from "kysely";

/**
 * Migration 013 — Log entries table for DB transport / audit trail
 *
 * Stores structured log entries written by the DB transport.
 * Admin audit log queries this table with filters on event_type,
 * entity_type, user_id, and date range.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("log_entries")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("level", "integer", (col) => col.notNull().defaultTo(20))
    .addColumn("timestamp", "real", (col) => col.notNull())
    .addColumn("time", "text", (col) => col.notNull())
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("module", "text")
    .addColumn("user_id", "text")
    .addColumn("session_id", "text")
    .addColumn("request_id", "text")
    .addColumn("meta", "text")
    .addColumn("event_type", "text")
    .addColumn("entity_type", "text")
    .addColumn("entity_id", "text")
    .addColumn("action", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema
    .createIndex("idx_log_entries_event_time")
    .on("log_entries")
    .columns(["event_type", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_log_entries_user_time")
    .on("log_entries")
    .columns(["user_id", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_log_entries_entity")
    .on("log_entries")
    .columns(["entity_type", "entity_id"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("log_entries").execute();
}
