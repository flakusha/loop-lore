/**
 * Migration 016: Telemetry Events Table
 *
 * Opt-in anonymized event tracking for operational observability.
 * Events are metadata-only — no content is stored.
 */
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("telemetry_events")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("session_id", "text")
    .addColumn("user_id", "text")
    .addColumn("chat_id", "text")
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("event_data", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("source", "text", (col) => col.notNull().defaultTo("server"))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo("(datetime('now'))"),
    )
    .execute();

  await db.schema
    .createIndex("idx_telemetry_events_type")
    .on("telemetry_events")
    .column("event_type")
    .execute();

  await db.schema
    .createIndex("idx_telemetry_events_created")
    .on("telemetry_events")
    .column("created_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("telemetry_events").ifExists().execute();
}