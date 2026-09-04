// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Core — final-form schema (Core identities + system).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("data_migrations",)
    .addColumn("table_name", "text", (col,) => col.notNull(),)
    .addColumn("from_version", "integer", (col,) => col.notNull(),)
    .addColumn("to_version", "integer", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("applied_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_data_migrations", ["table_name", "to_version",],)
    .execute();

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
    .createTable("meta_progression",)
    .addColumn("player_id", "text", (col,) => col.primaryKey().references("users.id",).onDelete("cascade",),)
    .addColumn("total_playthroughs", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("endings_seen", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("secrets_found", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("achievements_unlocked", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("permanent_bonuses", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("unlocked_content", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("model_capabilities",)
    .addColumn("id", "text", (col,) => col.primaryKey().notNull(),)
    .addColumn("provider_id", "text", (col,) => col.notNull(),)
    .addColumn("model_id", "text", (col,) => col.notNull(),)
    .addColumn("context_window", "integer",)
    .addColumn("max_output", "integer",)
    .addColumn("supports_tools", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("supports_vision", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("supports_thinking", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("modalities", "text",)
    .addColumn("param_size", "text",)
    .addColumn("owned_by", "text",)
    .addColumn("user_override", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("notes", "text",)
    .addColumn("last_seen", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_provider_model", ["provider_id", "model_id",],)
    .execute();

  await database.schema
    .createTable("model_comparisons",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("reference_model", "text", (col,) => col.notNull(),)
    .addColumn("preference", "text", (col,) => col.notNull(),)
    .addColumn("confidence", "real", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("model_role_overrides",)
    .addColumn("role", "text", (col,) => col.primaryKey(),)
    .addColumn("provider", "text", (col,) => col.notNull(),)
    .addColumn("model", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("temperature", "real",)
    .addColumn("max_tokens", "integer",)
    .execute();

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
    .createTable("plugin_state",)
    .addColumn("name", "text", (col,) => col.primaryKey(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("enabled_at", "text",)
    .addColumn("disabled_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("request_results",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("method", "text", (col,) => col.notNull(),)
    .addColumn("route_pattern", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text",)
    .addColumn("status", "text", (col,) => col.notNull(),)
    .addColumn("progress", "text",)
    .addColumn("response_status", "integer",)
    .addColumn("response_headers", "text",)
    .addColumn("response_body", "text",)
    .addColumn("error", "text",)
    .addColumn("started_at", "text", (col,) => col.notNull(),)
    .addColumn("completed_at", "text",)
    .addColumn("offloaded_at", "text",)
    .addColumn("offload_path", "text",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .createTable("seed_audit",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("seed_type", "text", (col,) => col.notNull(),)
    .addColumn("seed_id", "text", (col,) => col.notNull(),)
    .addColumn("seeded_by", "text", (col,) => col.notNull(),)
    .addColumn("seeded_at", "text", (col,) => col.notNull(),)
    .addColumn("environment", "text", (col,) => col.notNull(),)
    .addColumn("metadata", "text",)
    .execute();

  await database.schema
    .createTable("sessions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("token_hash", "text", (col,) => col.notNull(),)
    .addColumn("ip", "text",)
    .addColumn("user_agent", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_activity", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("system_config",)
    .addColumn("key", "text", (col,) => col.primaryKey(),)
    .addColumn("value", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

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
    .createTable("user_api_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("provider_name", "text", (col,) => col.notNull(),)
    .addColumn("api_key_encrypted", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("users",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("username", "text", (col,) => col.notNull().unique(),)
    .addColumn("display_name", "text", (col,) => col.notNull(),)
    .addColumn("password_hash", "text",)
    .addColumn("role", "text", (col,) => col.notNull().defaultTo("user",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("settings", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("birth_date", "text",)
    .addColumn("age_gate_accepted_at", "text",)
    .addColumn("format_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_seen_at", "text",)
    .addCheckConstraint(
      "ck_users_role",
      sql`role IN ('admin','moderator','user','creator','player','viewer','guest','bot','tester','custom','solo')`,
    )
    .execute();

  await database.schema
    .createIndex("idx_log_entries_entity",)
    .on("log_entries",)
    .columns(["entity_type", "entity_id",],)
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
    .createIndex("idx_model_capabilities_last_seen",)
    .on("model_capabilities",)
    .column("last_seen",)
    .execute();

  await database.schema
    .createIndex("idx_model_capabilities_provider",)
    .on("model_capabilities",)
    .column("provider_id",)
    .execute();

  await database.schema
    .createIndex("idx_notifications_created_at",)
    .on("notifications",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_notifications_user_read",)
    .on("notifications",)
    .columns(["user_id", "read", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_request_results_record_hash",)
    .on("request_results",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_request_results_status_completed",)
    .on("request_results",)
    .columns(["status", "completed_at",],)
    .execute();

  await database.schema
    .createIndex("idx_request_results_user_started",)
    .on("request_results",)
    .columns(["user_id", "started_at",],)
    .execute();

  await database.schema
    .createIndex("idx_sessions_created_at",)
    .on("sessions",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_sessions_last_activity",)
    .on("sessions",)
    .column("last_activity",)
    .execute();

  await database.schema
    .createIndex("idx_sessions_token_hash",)
    .on("sessions",)
    .column("token_hash",)
    .execute();

  await database.schema
    .createIndex("idx_sessions_user_expires",)
    .on("sessions",)
    .columns(["user_id", "expires_at",],)
    .execute();

  await database.schema
    .createIndex("idx_sessions_user_id",)
    .on("sessions",)
    .column("user_id",)
    .execute();

  await database.schema
    .createIndex("idx_telemetry_events_created",)
    .on("telemetry_events",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_telemetry_events_created_at",)
    .on("telemetry_events",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_telemetry_events_type",)
    .on("telemetry_events",)
    .column("event_type",)
    .execute();

  await database.schema
    .createIndex("idx_user_api_keys_created_at",)
    .on("user_api_keys",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_user_api_keys_updated_at",)
    .on("user_api_keys",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_user_api_keys_user_provider",)
    .on("user_api_keys",)
    .columns(["user_id", "provider_name",],)
    .execute();

  await database.schema
    .createIndex("idx_users_created_at",)
    .on("users",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_users_last_seen_at",)
    .on("users",)
    .column("last_seen_at",)
    .execute();

  await database.schema
    .createIndex("idx_users_role",)
    .on("users",)
    .column("role",)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("user_api_keys",).execute();
  await database.schema.dropTable("telemetry_events",).execute();
  await database.schema.dropTable("system_config",).execute();
  await database.schema.dropTable("sessions",).execute();
  await database.schema.dropTable("seed_audit",).execute();
  await database.schema.dropTable("request_results",).execute();
  await database.schema.dropTable("plugin_state",).execute();
  await database.schema.dropTable("notifications",).execute();
  await database.schema.dropTable("model_role_overrides",).execute();
  await database.schema.dropTable("model_comparisons",).execute();
  await database.schema.dropTable("model_capabilities",).execute();
  await database.schema.dropTable("meta_progression",).execute();
  await database.schema.dropTable("log_entries",).execute();
  await database.schema.dropTable("data_migrations",).execute();
  await database.schema.dropTable("users",).execute();
}
