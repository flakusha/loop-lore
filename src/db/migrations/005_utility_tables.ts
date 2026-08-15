import { type Kysely, sql, } from "kysely";

/**
 * Migration 012 — Consolidated utility tables
 *
 * Merges five small, independent table-creation migrations:
 * - 012_system_config (runtime config overrides)
 * - 013_log_entries (DB transport / audit trail)
 * - 014_plugin_state (plugin enable/disable)
 * - 016_telemetry_events (usage analytics)
 * - 023_notifications (per-user in-app notifications)
 *
 * No ordering dependencies between these tables — all create
 * standalone tables referencing only pre-existing tables (users).
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── System config ──────────────────────────────────────
  await database.schema
    .createTable("system_config",)
    .addColumn("key", "text", (col,) => col.primaryKey(),)
    .addColumn("value", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // ── Log entries ────────────────────────────────────────
  await database.schema
    .createTable("log_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(20,),)
    .addColumn("timestamp", "real", (col,) => col.notNull(),)
    .addColumn("time", "text", (col,) => col.notNull(),)
    .addColumn("message", "text", (col,) => col.notNull(),)
    .addColumn("module", "text",)
    .addColumn("user_id", "text",)
    .addColumn("session_id", "text",)
    .addColumn("request_id", "text",)
    .addColumn("meta", "text",)
    .addColumn("event_type", "text",)
    .addColumn("entity_type", "text",)
    .addColumn("entity_id", "text",)
    .addColumn("action", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_log_entries_event_time",)
    .on("log_entries",)
    .columns(["event_type", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_log_entries_user_time",)
    .on("log_entries",)
    .columns(["user_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_log_entries_entity",)
    .on("log_entries",)
    .columns(["entity_type", "entity_id",],)
    .execute();

  // ── Plugin state ───────────────────────────────────────
  await database.schema
    .createTable("plugin_state",)
    .addColumn("name", "text", (col,) => col.primaryKey(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("enabled_at", "text",)
    .addColumn("disabled_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // ── Telemetry events ───────────────────────────────────
  await database.schema
    .createTable("telemetry_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text",)
    .addColumn("user_id", "text",)
    .addColumn("chat_id", "text",)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("event_data", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("source", "text", (col,) => col.notNull().defaultTo("server",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_telemetry_events_type",)
    .on("telemetry_events",)
    .column("event_type",)
    .execute();

  await database.schema
    .createIndex("idx_telemetry_events_created",)
    .on("telemetry_events",)
    .column("created_at",)
    .execute();

  // ── Notifications ──────────────────────────────────────
  await database.schema
    .createTable("notifications",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("body", "text",)
    .addColumn("link", "text",)
    .addColumn("read", "text", (col,) => col.notNull().defaultTo("unread",),)
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

  await database.schema.dropIndex("idx_telemetry_events_created",).execute();
  await database.schema.dropIndex("idx_telemetry_events_type",).execute();
  await database.schema.dropTable("telemetry_events",).ifExists().execute();

  await database.schema.dropTable("plugin_state",).execute();

  await database.schema.dropIndex("idx_log_entries_entity",).execute();
  await database.schema.dropIndex("idx_log_entries_user_time",).execute();
  await database.schema.dropIndex("idx_log_entries_event_time",).execute();
  await database.schema.dropTable("log_entries",).execute();

  await database.schema.dropTable("system_config",).execute();
}
