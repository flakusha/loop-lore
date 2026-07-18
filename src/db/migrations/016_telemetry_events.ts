/**
 * Migration 016 — Telemetry events table
 *
 * No DEFAULT expression on created_at (SQLite limitation on ALTER TABLE ADD COLUMN).
 * Use `CURRENT_TIMESTAMP` in application code or rely on insertion-time value.
 */
import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("telemetry_events")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("session_id", "text")
    .addColumn("user_id", "text")
    .addColumn("chat_id", "text")
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("event_data", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("source", "text", (col) => col.notNull().defaultTo("server"))
    .addColumn("created_at", "text", (col) =>
      col.notNull(),
    )
    .execute();

  await database.schema
    .createIndex("idx_telemetry_events_type")
    .on("telemetry_events")
    .column("event_type")
    .execute();

  await database.schema
    .createIndex("idx_telemetry_events_created")
    .on("telemetry_events")
    .column("created_at")
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("telemetry_events").ifExists().execute();
}