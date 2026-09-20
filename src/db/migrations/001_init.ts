// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 001_init - final-form schema (v0 of loop-lore DB).
 *
 * Single atomic migration. All tables, indexes, triggers, and seed data
 * consolidated from the historical parts/ tree and 002-018, 023 forward
 * migrations. Append-only; subsequent changes go in new NNN_*.ts files.
 *
 * Two valid paths for new schema changes:
 *   1. Append a new top-level NNN_*.ts migration (default).
 *   2. Extend the current HEAD migration only if it has not yet shipped.
 * No parts/, no folding into a frozen base migration.
 */
import { type Kysely, sql, } from "kysely";
import * as enums from "../enums";
const { LocationKind, MobilityMode, } = enums;

async function hasThumbnailColumn(database: Kysely<unknown>,): Promise<boolean> {
  // pragma_table_info is a virtual table Kysely doesn't model; cast through never.
  const columns = await database
    .selectFrom("pragma_table_info" as never,)
    .$castTo<{ name: string }>()
    .select("name" as never,)
    .execute();
  return (columns as ReadonlyArray<{ name: string }>).some((row,) => row.name === "thumbnail_path");
}

export async function up(database: Kysely<unknown>,): Promise<void> {
  // --- parts/001_core.ts ---
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
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
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
  // --- parts/002_assets.ts ---
  await database.schema
    .createTable("asset_links",)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("entity_type", "text", (col,) => col.notNull(),)
    .addColumn("entity_id", "text", (col,) => col.notNull(),)
    .addColumn("label", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_asset_links", ["asset_id", "entity_type", "entity_id",],)
    .execute();

  await database.schema
    .createTable("asset_shares",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("shared_with_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("shared_by_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("assets",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("filename", "text", (col,) => col.notNull(),)
    .addColumn("mime_type", "text", (col,) => col.notNull(),)
    .addColumn("asset_type", "text", (col,) => col.notNull(),)
    .addColumn("size_bytes", "integer", (col,) => col.notNull(),)
    .addColumn("storage_path", "text", (col,) => col.notNull(),)
    .addColumn("storage_backend", "text", (col,) => col.notNull().defaultTo("local",),)
    .addColumn("width", "integer",)
    .addColumn("height", "integer",)
    .addColumn("duration_secs", "real",)
    .addColumn("alt_text", "text",)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("private",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("encryption_tier", "text", (col,) => col.notNull().defaultTo("public",),)
    .addColumn("encrypted_key_id", "text",)
    .addColumn("alpha_status", "text", (col,) => col.notNull().defaultTo("unknown",),)
    .addColumn("content_hash", "text",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .createTable("asset_transforms",)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("context", "text", (col,) => col.notNull(),)
    .addColumn("crop_x", "real",)
    .addColumn("crop_y", "real",)
    .addColumn("crop_w", "real",)
    .addColumn("crop_h", "real",)
    .addColumn("zoom", "real",)
    .addColumn("rotation", "real",)
    .addColumn("focal_point_x", "real",)
    .addColumn("focal_point_y", "real",)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_asset_transforms", ["asset_id", "context",],)
    .execute();

  await database.schema
    .createIndex("idx_asset_links_entity",)
    .on("asset_links",)
    .columns(["entity_type", "entity_id",],)
    .execute();

  await database.schema
    .createIndex("idx_asset_shares_asset",)
    .on("asset_shares",)
    .column("asset_id",)
    .execute();

  await database.schema
    .createIndex("idx_asset_shares_asset_with",)
    .on("asset_shares",)
    .columns(["asset_id", "shared_with_id",],)
    .execute();

  await database.schema
    .createIndex("idx_asset_shares_with",)
    .on("asset_shares",)
    .column("shared_with_id",)
    .execute();

  await database.schema
    .createIndex("idx_assets_created_at",)
    .on("assets",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_assets_owner",)
    .on("assets",)
    .column("owner_id",)
    .execute();

  await database.schema
    .createIndex("idx_assets_record_hash",)
    .on("assets",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_asset_transforms_asset",)
    .on("asset_transforms",)
    .column("asset_id",)
    .execute();
  // --- parts/003_worlds.ts ---
  await database.schema
    .createTable("location_states",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("description_override", "text",)
    .addColumn("atmosphere", "text",)
    .addColumn("npcs_present", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("items_available", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("time_of_day", "text",)
    .addColumn("weather", "text",)
    .addColumn("hazards", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("locations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("connections", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("publication_status", "text", (col,) => col.notNull().defaultTo("draft",),)
    .addColumn("parent_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("world_avatar_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("selection_rule_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("weights_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_world_avatar_config_world_actor", ["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("world_invites",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("code", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("max_uses", "integer",)
    .addColumn("uses", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .execute();

  await database.schema
    .createTable("world_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("owner_actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("spawn_condition", "text",)
    .addColumn("respawnable", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_world_items_quantity", sql`quantity > 0`,)
    .execute();

  await database.schema
    .createTable("world_lore_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text",)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("keys", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("secondary_keys", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("selective", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("case_sensitive", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("enabled", "text", (col,) => col.notNull().defaultTo("enabled",),)
    .addColumn("constant", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("position", "text", (col,) => col.notNull().defaultTo("before_char",),)
    .addColumn("insertion_order", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("comment", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("cooldown_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("last_activated", "text",)
    .addColumn("audience_scope", "text",)
    .addColumn("key_type", "text",)
    .addColumn("key_groups", "text",)
    .addColumn("scan_depth", "integer",)
    .addColumn("activation_chance", "real",)
    .addCheckConstraint("ck_wle_enabled", sql`enabled IN ('enabled', 'disabled', 'archived')`,)
    .execute();

  await database.schema
    .createTable("world_members",)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addPrimaryKeyConstraint("pk_world_members", ["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("world_states",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("snapshot", "text", (col,) => col.notNull(),)
    .addColumn("trigger_message_id", "text", (col,) => col.references("messages.id",),)
    .addColumn("trigger_turn_id", "text", (col,) => col.references("story_turns.id",),)
    .addColumn("description", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("world_timeline_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("story_id", "text",)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text",)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("data", "text",)
    .addColumn("occurred_at", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("timeline_id", "text", (col,) => col.notNull().defaultTo("prime",),)
    .execute();

  await database.schema
    .createTable("world_timelines",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("is_prime", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("world_event_steerings",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("timeline_id", "text", (col,) => col.notNull().defaultTo("prime",),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("manifest_probability", "real", (col,) => col.notNull().defaultTo(0.5,),)
    .addColumn("conditions", "text",)
    .addColumn("may_manifest", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("audience_scope", "text",)
    .addColumn("resolved_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("worlds",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("lore", "text",)
    .addColumn("publication_status", "text", (col,) => col.notNull().defaultTo("draft",),)
    .addColumn("kind", "text", (col,) => col.notNull().defaultTo("rpg",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("private",),)
    .addColumn("scan_depth", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("token_budget", "integer", (col,) => col.notNull().defaultTo(2000,),)
    .addColumn("difficulty_modifier", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("difficulty_reroll", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("difficulty_state", "text", (col,) => col.notNull().defaultTo("alive",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("nsfw_override", "text",)
    .addColumn("rpg_enabled", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .createIndex("idx_location_states_location",)
    .on("location_states",)
    .column("location_id",)
    .execute();

  await database.schema
    .createIndex("idx_location_states_world",)
    .on("location_states",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_locations_created_at",)
    .on("locations",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_locations_parent",)
    .on("locations",)
    .column("parent_location_id",)
    .execute();

  await database.schema
    .createIndex("idx_locations_world",)
    .on("locations",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_items_item",)
    .on("world_items",)
    .column("item_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_items_location",)
    .on("world_items",)
    .column("location_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_items_owner",)
    .on("world_items",)
    .column("owner_actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_items_world",)
    .on("world_items",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_lore_position",)
    .on("world_lore_entries",)
    .column("position",)
    .execute();

  await database.schema
    .createIndex("idx_world_lore_world",)
    .on("world_lore_entries",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_states_world",)
    .on("world_states",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_timelines_world",)
    .on("world_timelines",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_timelines_world_name",)
    .on("world_timelines",)
    .columns(["world_id", "name",],)
    .execute();

  await database.schema
    .createIndex("idx_worlds_created_at",)
    .on("worlds",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_worlds_record_hash",)
    .on("worlds",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_wte_world_timeline_occurred",)
    .on("world_timeline_events",)
    .columns(["world_id", "timeline_id", "occurred_at",],)
    .execute();

  await database.schema
    .createIndex("world_invites_world_idx",)
    .on("world_invites",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("world_timeline_events_world_occurred_idx",)
    .on("world_timeline_events",)
    .columns(["world_id", "occurred_at",],)
    .execute();

  await database.schema
    .createIndex("idx_wes_world_status",)
    .on("world_event_steerings",)
    .columns(["world_id", "status",],)
    .execute();
  // --- parts/004_actors.ts ---
  await database.schema
    .createTable("activitypub_actor_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("key_id", "text", (col,) => col.notNull(),)
    .addColumn("public_jwk", "text", (col,) => col.notNull(),)
    .addColumn("encrypted_private_jwk", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("rotated_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text",)
    // BUG-migration-activitypub-actor-keys-fk-missing-ondelete-cascade:
    // every other FK in the codebase cascades on actor delete; this one
    // omitted `.onDelete("cascade")` and would block actor removal with
    // a FK constraint violation when signing keys exist.
    .addForeignKeyConstraint(
      "fk_ap_actor_keys_actor",
      ["actor_id",],
      "actors",
      ["id",],
      (cb,) => cb.onDelete("cascade",),
    )
    .execute();

  await database.schema
    .createTable("actor_currencies",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("currency_type", "text", (col,) => col.notNull(),)
    .addColumn("balance", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_actor_currencies_balance", sql`balance >= 0`,)
    .execute();

  await database.schema
    .createTable("actor_e2e_pubkeys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("public_key_jwk", "text", (col,) => col.notNull(),)
    .addColumn("algorithm", "text", (col,) => col.notNull().defaultTo("ECDH-P256",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("revoked_at", "text",)
    .execute();

  await database.schema
    .createTable("actor_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("item_type", "text", (col,) => col.notNull(),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("value", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("weight", "real",)
    .addColumn("tags", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("equipped", "text", (col,) => col.notNull().defaultTo("unequipped",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("durability", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("max_durability", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addCheckConstraint(
      "ck_actor_items_type",
      sql`item_type IN ('weapon','armor','consumable','key_item','quest_item','material','tool','container','treasure','book','artifact','misc','other')`,
    )
    .execute();

  await database.schema
    .createTable("actor_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("key_type", "text", (col,) => col.notNull(),)
    .addColumn("encrypted_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("public_key", "text",)
    .execute();

  await database.schema
    .createTable("actor_lore_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text",)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("keys", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("secondary_keys", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("selective", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("case_sensitive", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("enabled", "text", (col,) => col.notNull().defaultTo("enabled",),)
    .addColumn("constant", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("position", "text", (col,) => col.notNull().defaultTo("before_char",),)
    .addColumn("insertion_order", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("comment", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("cooldown_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("last_activated", "text",)
    .addColumn("audience_scope", "text",)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("key_type", "text",)
    .addColumn("key_groups", "text",)
    .addColumn("scan_depth", "integer",)
    .addColumn("activation_chance", "real",)
    .addCheckConstraint("ck_ale_enabled", sql`enabled IN ('enabled', 'disabled', 'archived')`,)
    .execute();

  await database.schema
    .createTable("actor_notes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull().defaultTo("general",),)
    .addColumn("pinned", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("actors",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_type", "text", (col,) => col.notNull().defaultTo("user",),)
    .addColumn("display_name", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text", (col,) => col.references("users.id",),)
    .addColumn("owner_id", "text", (col,) => col.references("users.id",),)
    .addColumn("avatar_asset_id", "text", (col,) => col.references("assets.id",),)
    .addColumn("description", "text",)
    .addColumn("system_prompt", "text",)
    .addColumn("agent_type", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("settings", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("format_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("private",),)
    .addColumn("welcome_message", "text",)
    .addColumn("personality", "text",)
    .addColumn("appearance", "text",)
    .addColumn("default_outfit", "text",)
    .addColumn("outfits", "text",)
    .addColumn("scenario", "text",)
    .addColumn("mes_example", "text",)
    .addColumn("alternate_greetings", "text",)
    .addColumn("post_history_instructions", "text",)
    .addColumn("creator_notes", "text",)
    .addColumn("creator", "text",)
    .addColumn("character_version", "text",)
    .addColumn("import_spec", "text", (col,) => col.notNull().defaultTo("raw",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("content_rating", "text", (col,) => col.notNull().defaultTo("sfw",),)
    .addColumn("template_overrides", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("data_source_format", "text", (col,) => col.defaultTo("json",),)
    .addColumn("data_raw", "text",)
    .addColumn("agent_role", "text",)
    .addColumn("growth_mode", "text", (col,) => col.notNull().defaultTo("dynamic",),)
    .addColumn("llm_assist_enabled", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .createTable("admin_character_overrides",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("admin_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("visibility_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("license_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("reason", "text", (col,) => col.defaultTo(null,),)
    .addColumn("expires_at", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_actor_currencies_actor_world",)
    .on("actor_currencies",)
    .columns(["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_actor_e2e_pubkeys_actor_id",)
    .on("actor_e2e_pubkeys",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_e2e_pubkeys_revoked",)
    .on("actor_e2e_pubkeys",)
    .column("revoked_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_items_actor",)
    .on("actor_items",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_items_created_at",)
    .on("actor_items",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_items_updated_at",)
    .on("actor_items",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_keys_actor_id",)
    .on("actor_keys",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_keys_status",)
    .on("actor_keys",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_actor_lore_actor",)
    .on("actor_lore_entries",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_lore_entries_world",)
    .on("actor_lore_entries",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_lore_position",)
    .on("actor_lore_entries",)
    .column("position",)
    .execute();

  await database.schema
    .createIndex("idx_actor_notes_actor",)
    .on("actor_notes",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_notes_created_at",)
    .on("actor_notes",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_notes_updated_at",)
    .on("actor_notes",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_actors_created_at",)
    .on("actors",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_actors_owner",)
    .on("actors",)
    .column("owner_id",)
    .execute();

  await database.schema
    .createIndex("idx_actors_type",)
    .on("actors",)
    .column("actor_type",)
    .execute();

  await database.schema
    .createIndex("idx_actors_updated_at",)
    .on("actors",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_actors_user_id",)
    .on("actors",)
    .column("user_id",)
    .execute();

  await database.schema
    .createIndex("idx_ap_actor_keys_actor_status",)
    .on("activitypub_actor_keys",)
    .columns(["actor_id", "status",],)
    .execute();
  // --- parts/005_characters.ts ---
  await database.schema
    .createTable("character_arc",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("current_stage", "text", (col,) => col.notNull(),)
    .addColumn("stage_description", "text",)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_character_arc_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("growth_log",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("axis", "text", (col,) => col.notNull(),)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("applied",),)
    .addColumn("subject_kind", "text",)
    .addColumn("subject_id", "text",)
    .addColumn("before_json", "text",)
    .addColumn("after_json", "text",)
    .addColumn("reason", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("source_event_id", "text",)
    .addColumn("recorded_at", "text", (col,) => col.notNull(),)
    .addColumn("confirmed_at", "text",)
    .addColumn("confirmed_by", "text",)
    .execute();

  await database.schema
    .createTable("character_arousal",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("buildup_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("decay_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("modifiers", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("last_update", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_arousal_actor_world", ["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_availability",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("available",),)
    .addColumn("usage_policy", "text", (col,) => col.defaultTo(null,),)
    .addColumn("activity_restrictions", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("content_policy", "text", (col,) => col.defaultTo(null,),)
    .addColumn("nsfw_policy", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_availability_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_avatar_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("selection_rule", "text", (col,) => col.notNull().defaultTo("emotion_first",),)
    .addColumn("weights", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("fallback_chain", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_avatar_config_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_avatars",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",).onDelete("cascade",),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("tags", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("is_primary", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("character_body_profile",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("stamina", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("flexibility", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("sensitivity", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("endurance", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("size_category", "text", (col,) => col.notNull().defaultTo("average",),)
    .addColumn("build", "text", (col,) => col.notNull().defaultTo("average",),)
    .addColumn("beauty", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("charisma", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("style", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("scent", "text", (col,) => col.defaultTo(null,),)
    .addColumn("modifications", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addUniqueConstraint("uq_body_profile_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_desire_profile",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("turn_ons", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("turn_offs", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("fetishes", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("hard_limits", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("current_desire", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("desire_decay_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("desire_buildup_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addUniqueConstraint("uq_desire_profile_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_emotions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("emotion_id", "text", (col,) => col.notNull().references("emotions.id",).onDelete("cascade",),)
    .addColumn("intensity", "real", (col,) => col.notNull().defaultTo(0.5,),)
    .addColumn("context", "text", (col,) => col.defaultTo(null,),)
    .addColumn("expires_at", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_character_emotions_actor_emotion", ["actor_id", "emotion_id",],)
    .execute();

  await database.schema
    .createTable("character_fantasies",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("fantasy_name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("intensity", "text", (col,) => col.notNull().defaultTo("mild",),)
    .addColumn("requirements", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("fulfillment_effects", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("risks", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("discovered_through", "text", (col,) => col.defaultTo(null,),)
    .addColumn("initial_reaction", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("current_feeling", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("times_explored", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("character_heat_cycle",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("species", "text", (col,) => col.notNull().defaultTo("human",),)
    .addColumn("cycle_length_days", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("current_phase", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("days_until_next_heat", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("effects", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_heat_cycle_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_internal_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("aspirations", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("moral_disposition", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("autonomy_preferences", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("coping_mechanisms", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("approach_tendencies", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("voice_patterns", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("character_intimacy",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("target_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("score", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("action_history", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("unlocked_thresholds", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_intimacy_actor_target_world", ["actor_id", "target_actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_licensing",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("license_type", "text", (col,) => col.notNull(),)
    .addColumn("custom_license_text", "text", (col,) => col.defaultTo(null,),)
    .addColumn("attribution", "text", (col,) => col.defaultTo(null,),)
    .addColumn("allow_derivatives", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("allow_commercial", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("share_alike", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_licensing_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_location_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("bonus", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("penalty", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("effects", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("equipment_override", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("last_drifted_at", "text",)
    .addColumn("drift_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addUniqueConstraint("uq_location_traits_actor_location_name", ["actor_id", "location_id", "trait_name",],)
    .execute();

  await database.schema
    .createTable("character_mood",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("happiness", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("base_mood", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("current_mood", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("mood_stability", "real", (col,) => col.notNull().defaultTo(0.5,),)
    .addColumn("expression_modifiers", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("last_mood_change", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_mood_actor_world", ["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_permanent_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("trait_category", "text", (col,) => col.notNull(),)
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("immutable", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_permanent_traits_actor_name", ["actor_id", "trait_name",],)
    .execute();

  await database.schema
    .createTable("character_relationships",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("target_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("relationship_type", "text", (col,) => col.notNull(),)
    .addColumn("standing", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("trust", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("familiarity", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("is_bidirectional", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("evolution_tracked", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("last_evolution_at", "text",)
    .addUniqueConstraint("uq_relationships_actor_target_world", ["actor_id", "target_actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_seduction_skills",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("skill_category", "text", (col,) => col.notNull(),)
    .addColumn("skill_name", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp_to_next", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addUniqueConstraint("uq_seduction_skills_actor_category_name", ["actor_id", "skill_category", "skill_name",],)
    .execute();

  await database.schema
    .createTable("character_skills",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("proficiency", "text", (col,) => col.notNull().defaultTo("novice",),)
    .addColumn("specialization", "text",)
    .addColumn("lock_state", "text", (col,) => col.notNull().defaultTo("unlocked",),)
    .addColumn("prerequisites", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("acquired_at", "text",)
    .addColumn("acquisition_reason", "text",)
    .addColumn("acquisition_source", "text", (col,) => col.notNull().defaultTo("baseline",),)
    .execute();

  await database.schema
    .createTable("character_stats",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("hp", "integer", (col,) => col.notNull(),)
    .addColumn("max_hp", "integer", (col,) => col.notNull(),)
    .addColumn("temp_hp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("mp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("max_mp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("ac", "integer", (col,) => col.notNull(),)
    .addColumn("speed", "integer", (col,) => col.notNull().defaultTo(30,),)
    .addColumn("str", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("dex", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("con", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("int", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("wis", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("cha", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("hit_dice", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("death_save_successes", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("death_save_failures", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp_to_next", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("behavior_profile", "text", (col,) => col.defaultTo("companion",),)
    .addColumn("evasiveness", "real", (col,) => col.defaultTo(0,),)
    .addColumn("cooperativeness", "real", (col,) => col.defaultTo(0.5,),)
    .addColumn("aggression_threshold", "real", (col,) => col.defaultTo(0.5,),)
    .addColumn("character_state", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("conditions", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("active_effects", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("combat_alignment", "text", (col,) => col.notNull().defaultTo("player",),)
    .execute();

  await database.schema
    .createTable("character_world_setup",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("starting_inventory", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("lore_entries", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("backstory", "text",)
    .addColumn("scenario_override", "text",)
    .addColumn("system_prompt_override", "text",)
    .addColumn("initial_state", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addUniqueConstraint("uq_character_world_setup_actor_world", ["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_world_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("trait_category", "text", (col,) => col.notNull(),)
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("last_drifted_at", "text",)
    .addColumn("drift_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addUniqueConstraint("uq_world_traits_actor_world_name", ["actor_id", "world_id", "trait_name",],)
    .execute();

  await database.schema
    .createTable("characters",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("avatar_asset_id", "text", (col,) => col.references("assets.id",),)
    .addColumn("description", "text",)
    .addColumn("system_prompt", "text",)
    .addColumn("agent_type", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("settings", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("agent_role", "text",)
    .addColumn("federation_consent", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .createTable("emotions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("display_name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("valence", "real", (col,) => col.notNull(),)
    .addColumn("arousal", "real", (col,) => col.notNull(),)
    .addColumn("icon", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_emotions_name", ["name",],)
    .execute();

  await database.schema
    .createTable("mood_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("happiness_delta", "integer", (col,) => col.notNull(),)
    .addColumn("mood_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_body_profile_world",)
    .on("character_body_profile",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_arc_actor",)
    .on("character_arc",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_growth_log_actor_recorded",)
    .on("growth_log",)
    .columns(["actor_id", "recorded_at",],)
    .execute();

  await database.schema
    .createIndex("idx_growth_log_actor_axis_status",)
    .on("growth_log",)
    .columns(["actor_id", "axis", "status",],)
    .execute();

  await database.schema
    .createIndex("idx_char_arousal_actor",)
    .on("character_arousal",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_char_intimacy_actor",)
    .on("character_intimacy",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_char_rel_target_world",)
    .on("character_relationships",)
    .columns(["target_actor_id", "world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_character_internal_traits_actor",)
    .on("character_internal_traits",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_skills_actor",)
    .on("character_skills",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_skills_actor_world",)
    .on("character_skills",)
    .columns(["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_character_stats_actor",)
    .on("character_stats",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_world_setup_actor",)
    .on("character_world_setup",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_world_setup_world",)
    .on("character_world_setup",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_characters_created_at",)
    .on("characters",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_characters_owner",)
    .on("characters",)
    .column("owner_id",)
    .execute();

  await database.schema
    .createIndex("idx_characters_record_hash",)
    .on("characters",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_characters_updated_at",)
    .on("characters",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_desire_profile_world",)
    .on("character_desire_profile",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_mood_events_actor",)
    .on("mood_events",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_seduction_skills_world",)
    .on("character_seduction_skills",)
    .column("world_id",)
    .execute();
  // --- parts/006_chat.ts ---
  await database.schema
    .createTable("chat_background_assignments",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn(
      "background_id",
      "text",
      (col,) => col.notNull().references("chat_backgrounds.id",).onDelete("cascade",),
    )
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_backgrounds",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.notNull().defaultTo("static",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("config", "text",)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_invites",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("code", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("max_uses", "integer",)
    .addColumn("uses", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .execute();

  await database.schema
    .createTable("chat_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("encrypted_chat_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .execute();

  await database.schema
    .createTable("chat_location_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("from_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("to_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("triggering_message_id", "text", (col,) => col.references("messages.id",).onDelete("set null",),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_mentions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_participants",)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("role_in_chat", "text", (col,) => col.notNull().defaultTo("member",),)
    .addColumn("joined_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_read_message_id", "text",)
    .addColumn("impersonate_actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("persona_id", "text", (col,) => col.references("personas.id",),)
    .addColumn("talkativity", "integer", (col,) => col.notNull().defaultTo(5,),)
    .addColumn("initiative", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addPrimaryKeyConstraint("pk_chat_participants", ["chat_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("chat_pins",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("pinned_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("pinned_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_sections",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("sort_index", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("background_id", "text", (col,) => col.references("chat_backgrounds.id",).onDelete("set null",),)
    .execute();

  await database.schema
    .createTable("chat_setup_templates",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("slug", "text", (col,) => col.notNull().unique(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("mode", "text",)
    .addColumn("turn_strategy", "text",)
    .addColumn("world_id", "text",)
    .addColumn("gm_config", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("features", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("visibility", "text", (col,) => col.defaultTo(null,),)
    .execute();

  await database.schema
    .createTable("chats",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.notNull().defaultTo("direct",),)
    .addColumn("mode", "text", (col,) => col.notNull().defaultTo("direct",),)
    .addColumn("created_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",),)
    .addColumn("current_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("story_state", "text",)
    .addColumn("gm_config", "text",)
    .addColumn("turn_strategy", "text",)
    .addColumn("max_turns", "integer",)
    .addColumn("auto_advance", "integer",)
    .addColumn("parent_chat_id", "text", (col,) => col.references("chats.id",).onUpdate("cascade",),)
    .addColumn("is_pinned", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .addColumn("encryption_level", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("response_length_preset", "text", (col,) => col.notNull().defaultTo("medium",),)
    .addColumn("response_length_custom", "integer",)
    .addColumn("context_max_tokens", "integer",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("streaming", "integer",)
    .addColumn("nsfw_override", "text",)
    .addColumn("name_source", "text",)
    .addColumn("template_id", "text", (col,) => col.references("chat_setup_templates.id",).onDelete("set null",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("private",),)
    .addColumn("thinking_visibility", "text", (col,) => col.notNull().defaultTo("hidden",),)
    .addColumn("quick_replies", "text",)
    .addColumn("prompt_override", "text",)
    .addColumn("output_style_preset", "text",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("custom_instructions", "text",)
    .addCheckConstraint("ck_chats_type", sql`type IN ('direct', 'group')`,)
    .execute();

  await database.schema
    .createTable("chat_random_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("event_id", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("token_count", "integer", (col,) => col.notNull(),)
    .addColumn("fired_at", "integer", (col,) => col.notNull(),)
    .addColumn("expires_at", "integer", (col,) => col.notNull(),)
    .addColumn("fired_count", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addUniqueConstraint("uq_chat_random_events_chat_event", ["chat_id", "event_id",],)
    .execute();

  await database.schema
    .createTable("group_initiatives",)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("score", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_group_initiatives", ["chat_id", "scene_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("message_reactions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("emoji", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("message_seen",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("unseen",),)
    .addColumn("seen_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("message_translations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("locale", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("provider", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .createTable("messages",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("parent_id", "text", (col,) => col.references("messages.id",),)
    .addColumn("role", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("key_id", "text",)
    .addColumn("content_format", "text", (col,) => col.notNull().defaultTo("markdown",),)
    .addColumn("content_type", "text", (col,) => col.notNull().defaultTo("text",),)
    .addColumn("content_encoding", "text", (col,) => col.notNull().defaultTo("identity",),)
    .addColumn("emotion", "text",)
    .addColumn("model_id", "text",)
    .addColumn("provider", "text",)
    .addColumn("token_count_prompt", "integer",)
    .addColumn("token_count_completion", "integer",)
    .addColumn("token_count_total", "integer",)
    .addColumn("token_cost", "real",)
    .addColumn("generation_time_ms", "integer",)
    .addColumn("tokens_per_second", "real",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("hidden_by", "text",)
    .addColumn("hidden_reason", "text",)
    .addColumn("idempotency_key", "text",)
    .addColumn("continuation_index", "integer",)
    .addColumn("swipe_index", "integer",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("edited_at", "text",)
    .addColumn("attachments", "text",)
    .addColumn("archived_at", "text",)
    .addColumn("format_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("tool_calls", "text",)
    .addColumn("thinking", "text",)
    .addColumn("metadata", "text",)
    .addColumn("e2e_payload", "text",)
    .addColumn("e2e_session_id", "text", (col,) => col.references("e2e_sessions.id",).onDelete("set null",),)
    .addColumn("e2e_sender_eph_pub_jwk", "text",)
    .addColumn("e2e_chain_index", "integer",)
    .addColumn("content_plaintext", "text",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .createTable("music_links",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("sender_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("service", "text", (col,) => col.notNull(),)
    .addColumn("url", "text", (col,) => col.notNull(),)
    .addColumn("embed_html", "text",)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("artist", "text", (col,) => col.notNull(),)
    .addColumn("thumbnail_url", "text",)
    .addColumn("duration_secs", "integer",)
    .addColumn("service_track_id", "text", (col,) => col.notNull(),)
    .addColumn("service_url", "text", (col,) => col.notNull(),)
    .addColumn("is_playlist", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("track_count", "integer",)
    .addColumn("explicit", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("year", "integer",)
    .addColumn("genre", "text",)
    .addColumn("nsfw_hidden", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("proactive_messaging_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("frequency", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("quiet_hours_start", "text",)
    .addColumn("quiet_hours_end", "text",)
    .addColumn("enabled", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("last_proactive_at", "text",)
    .addColumn("backoff_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("config_json", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("story_turns",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("turn_number", "integer", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("turn_type", "text", (col,) => col.notNull(),)
    .addColumn("prompt_sent", "text", (col,) => col.notNull(),)
    .addColumn("response_received", "text",)
    .addColumn("quality_score", "real",)
    .addColumn("quality_details", "text",)
    .addColumn("regeneration_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("gm_decision", "text",)
    .addColumn("world_events", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("quest_progress", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("started_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("vn_choices",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_index", "integer", (col,) => col.notNull(),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("consequences", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("relationship_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("mood_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("unlock_conditions", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("available",),)
    .addColumn("selected_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("chat_background_assignments_chat_idx",)
    .on("chat_background_assignments",)
    .column("chat_id",)
    .unique()
    .execute();

  await database.schema
    .createIndex("chat_invites_chat_idx",)
    .on("chat_invites",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("chat_location_events_chat_created_idx",)
    .on("chat_location_events",)
    .columns(["chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("chat_sections_chat_sort_idx",)
    .on("chat_sections",)
    .columns(["chat_id", "sort_index",],)
    .execute();

  await database.schema
    .createIndex("idx_chat_keys_chat_id",)
    .on("chat_keys",)
    .column("chat_id",)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_chat_mentions_actor",)
    .on("chat_mentions",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_mentions_message",)
    .on("chat_mentions",)
    .column("message_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_actor",)
    .on("chat_participants",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_impersonate",)
    .on("chat_participants",)
    .column("impersonate_actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_persona",)
    .on("chat_participants",)
    .column("persona_id",)
    .execute();

  await database.schema
    .createIndex("idx_chats_created_at",)
    .on("chats",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_chats_created_by",)
    .on("chats",)
    .column("created_by",)
    .execute();

  await database.schema
    .createIndex("idx_chats_location",)
    .on("chats",)
    .column("current_location_id",)
    .execute();

  await database.schema
    .createIndex("idx_chats_parent",)
    .on("chats",)
    .column("parent_chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_chats_pinned",)
    .on("chats",)
    .column("is_pinned",)
    .execute();

  await database.schema
    .createIndex("idx_chats_record_hash",)
    .on("chats",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_chats_updated_at",)
    .on("chats",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_chats_world",)
    .on("chats",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_group_initiatives_chat",)
    .on("group_initiatives",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_message_seen_message_actor_unique",)
    .on("message_seen",)
    .columns(["message_id", "actor_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_message_translations_created_at",)
    .on("message_translations",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_actor",)
    .on("messages",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_messages_archived",)
    .on("messages",)
    .column("archived_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_chat_created",)
    .on("messages",)
    .columns(["chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_messages_content_format",)
    .on("messages",)
    .column("content_format",)
    .execute();

  await database.schema
    .createIndex("idx_messages_created_at",)
    .on("messages",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_e2e_chain",)
    .on("messages",)
    .columns(["e2e_session_id", "e2e_chain_index",],)
    .execute();

  await database.schema
    .createIndex("idx_messages_e2e_session",)
    .on("messages",)
    .column("e2e_session_id",)
    .execute();

  await database.schema
    .createIndex("idx_messages_edited_at",)
    .on("messages",)
    .column("edited_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_idempotency",)
    .on("messages",)
    .column("idempotency_key",)
    .execute();

  await database.schema
    .createIndex("idx_messages_key_id",)
    .on("messages",)
    .column("key_id",)
    .execute();

  await database.schema
    .createIndex("idx_messages_parent",)
    .on("messages",)
    .column("parent_id",)
    .execute();

  await database.schema
    .createIndex("idx_messages_record_hash",)
    .on("messages",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_messages_status",)
    .on("messages",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_messages_swipe_unique",)
    .on("messages",)
    .columns(["chat_id", "parent_id", "swipe_index",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_messages_visibility",)
    .on("messages",)
    .column("visibility",)
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

  await database.schema
    .createIndex("idx_proactive_messaging_actor",)
    .on("proactive_messaging_config",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_proactive_messaging_chat",)
    .on("proactive_messaging_config",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_proactive_messaging_chat_actor",)
    .on("proactive_messaging_config",)
    .columns(["chat_id", "actor_id",],)
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

  await database.schema
    .createIndex("idx_seen_actor",)
    .on("message_seen",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_seen_message",)
    .on("message_seen",)
    .column("message_id",)
    .execute();

  await database.schema
    .createIndex("idx_story_turns_actor",)
    .on("story_turns",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_story_turns_chat",)
    .on("story_turns",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_story_turns_chat_number",)
    .on("story_turns",)
    .columns(["chat_id", "turn_number",],)
    .execute();

  await database.schema
    .createIndex("idx_story_turns_created_at",)
    .on("story_turns",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_vn_choices_chat_id",)
    .on("vn_choices",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_vn_choices_scene",)
    .on("vn_choices",)
    .columns(["chat_id", "scene_index",],)
    .execute();

  await database.schema
    .createIndex("music_links_chat_created_idx",)
    .on("music_links",)
    .columns(["chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("music_links_sender_idx",)
    .on("music_links",)
    .column("sender_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_random_events_chat_expires",)
    .on("chat_random_events",)
    .columns(["chat_id", "expires_at",],)
    .execute();

  await database.schema
    .createIndex("idx_chat_random_events_chat_fired",)
    .on("chat_random_events",)
    .columns(["chat_id", "fired_at",],)
    .execute();
  // --- parts/007_personas.ts ---
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
    .addColumn("format_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("temperature", "real",)
    .addColumn("max_tokens", "integer",)
    .addColumn("model", "text",)
    .execute();

  await database.schema
    .createIndex("idx_personas_created_at",)
    .on("personas",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_personas_default",)
    .on("personas",)
    .columns(["user_id", "is_default",],)
    .execute();

  await database.schema
    .createIndex("idx_personas_updated_at",)
    .on("personas",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_personas_user_id",)
    .on("personas",)
    .column("user_id",)
    .execute();
  // --- parts/008_story.ts ---
  await database.schema
    .createTable("items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .addColumn("stackable", "text", (col,) => col.notNull().defaultTo("unique",),)
    .addColumn("max_stack", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("properties", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("value", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("weight", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_items_category",
      sql`category IN ('weapon','armor','consumable','key_item','quest_item','material','tool','container','treasure','book','artifact','misc','other')`,
    )
    .addCheckConstraint(
      "ck_items_rarity",
      sql`rarity IN ('common','uncommon','rare','epic','legendary','unique','artifact')`,
    )
    .execute();

  await database.schema
    .createTable("npc_states",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("health", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("mental_state", "text", (col,) => col.notNull().defaultTo("calm",),)
    .addColumn("knowledge", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("relationships", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("inventory", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("schedule", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("quest_progress",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("quest_id", "text", (col,) => col.notNull().references("quests.id",),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("progress", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("contributed_events", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("started_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .execute();

  await database.schema
    .createTable("quests",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("creator_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull().defaultTo("side",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("config", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("progress", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("target", "integer", (col,) => col.notNull(),)
    .addColumn("start_time", "text",)
    .addColumn("deadline", "text",)
    .addColumn("time_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("rewards", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("narrative_hooks", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .execute();

  await database.schema
    .createTable("shadow_notes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("hidden",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("whitenotes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(5,),)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("scene",),)
    .addColumn("expires_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_items_category",)
    .on("items",)
    .column("category",)
    .execute();

  await database.schema
    .createIndex("idx_items_world",)
    .on("items",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_npc_states_actor",)
    .on("npc_states",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_npc_states_location",)
    .on("npc_states",)
    .column("location_id",)
    .execute();

  await database.schema
    .createIndex("idx_npc_states_world",)
    .on("npc_states",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_quest_progress_chat",)
    .on("quest_progress",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_quest_progress_created_at",)
    .on("quest_progress",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_quest_progress_quest",)
    .on("quest_progress",)
    .column("quest_id",)
    .execute();

  await database.schema
    .createIndex("idx_quest_progress_quest_chat",)
    .on("quest_progress",)
    .columns(["quest_id", "chat_id",],)
    .execute();

  await database.schema
    .createIndex("idx_quests_created_at",)
    .on("quests",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_quests_creator",)
    .on("quests",)
    .column("creator_id",)
    .execute();

  await database.schema
    .createIndex("idx_quests_status",)
    .on("quests",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_quests_world",)
    .on("quests",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_shadow_notes_chat_id",)
    .on("shadow_notes",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_whitenotes_chat_id",)
    .on("whitenotes",)
    .column("chat_id",)
    .execute();
  // --- parts/009_crafting.ts ---
  await database.schema
    .createTable("crafting_attempts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn(
      "station_instance_id",
      "text",
      (col,) => col.references("crafting_station_instances.id",).onDelete("set null",),
    )
    .addColumn("materials_used", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("status", "text", (col,) => col.notNull(),)
    .addColumn("quality_achieved", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("output_item_id", "text", (col,) => col.references("items.id",).onDelete("set null",),)
    .addColumn("output_quantity", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("experience_gained", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("skill_increase", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("bonus_effects", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("duration_ms", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_orders",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("requester_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("crafter_actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_quality", "text",)
    .addColumn("offered_payment", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("offered_materials", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("open",),)
    .addColumn("deadline", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("trade_type", "text", (col,) => col.notNull().defaultTo("crafting",),)
    .execute();

  await database.schema
    .createTable("crafting_recipe_materials",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("slot_type", "text", (col,) => col.notNull().defaultTo("required",),)
    .addColumn("quality_requirement", "text",)
    .addColumn("bonus_effect", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_recipes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("discipline", "text", (col,) => col.notNull(),)
    .addColumn("tier", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("level_required", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("output_item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("output_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("crafting_time_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("base_success_chance", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("base_quality_min", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("base_quality_max", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("perfect_threshold", "integer", (col,) => col.notNull().defaultTo(95,),)
    .addColumn("station_type_required", "text",)
    .addColumn("discovered_by_default", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("tags", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_station_defs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("station_type", "text", (col,) => col.notNull(),)
    .addColumn("tier", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("speed_bonus", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("quality_bonus", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("success_bonus", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("material_saving_chance", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("max_durability", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_station_instances",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "station_def_id",
      "text",
      (col,) => col.notNull().references("crafting_station_defs.id",).onDelete("cascade",),
    )
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("owner_actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("current_durability", "integer", (col,) => col.notNull(),)
    .addColumn("is_active", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("gathering_node_defs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("node_type", "text", (col,) => col.notNull(),)
    .addColumn("skill_required", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("respawn_time_seconds", "integer", (col,) => col.notNull().defaultTo(300,),)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .addColumn("max_uses", "integer", (col,) => col.notNull().defaultTo(-1,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("gathering_node_instances",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "node_def_id",
      "text",
      (col,) => col.notNull().references("gathering_node_defs.id",).onDelete("cascade",),
    )
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("current_uses", "integer", (col,) => col.notNull(),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("available",),)
    .addColumn("respawn_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("gathering_node_materials",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "node_def_id",
      "text",
      (col,) => col.notNull().references("gathering_node_defs.id",).onDelete("cascade",),
    )
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("min_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("drop_chance", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("min_quality", "text",)
    .addColumn("max_quality", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("profession_specializations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("profession_id", "text", (col,) => col.notNull().references("professions.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("bonus_type", "text", (col,) => col.notNull(),)
    .addColumn("bonus_value", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("requirement_level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("requirement_specializations", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("is_active", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("professions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("discipline", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("experience", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("title", "text", (col,) => col.notNull().defaultTo("apprentice",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_profession_actor_world_discipline", ["actor_id", "world_id", "discipline",],)
    .execute();

  await database.schema
    .createTable("recipe_discoveries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("discovery_method", "text", (col,) => col.notNull(),)
    .addColumn("discovered_at", "text", (col,) => col.notNull(),)
    .addColumn("mastery_level", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addUniqueConstraint("uq_recipe_discovery_actor_recipe", ["actor_id", "recipe_id",],)
    .execute();

  await database.schema
    .createIndex("idx_crafting_attempts_created_at",)
    .on("crafting_attempts",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_crafting_attempts_world_actor",)
    .on("crafting_attempts",)
    .columns(["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createIndex("idx_crafting_orders_created_at",)
    .on("crafting_orders",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_crafting_orders_world",)
    .on("crafting_orders",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_crafting_recipes_created_at",)
    .on("crafting_recipes",)
    .column("created_at",)
    .execute();
  // --- parts/010_progression.ts ---
  await database.schema
    .createTable("achievements",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("tier", "text", (col,) => col.notNull(),)
    .addColumn("icon", "text",)
    .addColumn("is_secret", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("is_hidden", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("unlock_condition", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("rewards", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("battles",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("round", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("turn_index", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("combatants", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("log", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_by", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("ended_at", "text",)
    .execute();

  await database.schema
    .createTable("dice_roll_history",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text",)
    .addColumn("actor_id", "text",)
    .addColumn("sides", "integer", (col,) => col.notNull(),)
    .addColumn("count", "integer", (col,) => col.notNull(),)
    .addColumn("modifier", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("advantage_mode", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("exploding", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("raw_rolls", "text", (col,) => col.notNull(),)
    .addColumn("raw_total", "integer", (col,) => col.notNull(),)
    .addColumn("total", "integer", (col,) => col.notNull(),)
    .addColumn("purpose", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("loot_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("loot_table_id", "text", (col,) => col.notNull(),)
    .addColumn("item_name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("item_type", "text", (col,) => col.notNull(),)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .addColumn("weight", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("min_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("min_level", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("loot_tables",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("source_type", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text",)
    .addColumn("total_weight", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("used", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("player_achievements",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("player_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("achievement_id", "text", (col,) => col.notNull().references("achievements.id",).onDelete("cascade",),)
    .addColumn("progress", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("max_progress", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("locked",),)
    .addColumn("unlocked_at", "text",)
    .addColumn("claimed_at", "text",)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("playthroughs",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("player_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("playthrough_number", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("difficulty", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("ending_id", "text",)
    .addColumn("ending_type", "text",)
    .addColumn("completion_time", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("choices_made", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("secrets_found", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("achievements_unlocked", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .execute();

  await database.schema
    .createTable("trade_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull(),)
    .addColumn("buyer_actor_id", "text", (col,) => col.notNull(),)
    .addColumn("seller_actor_id", "text", (col,) => col.notNull(),)
    .addColumn("price", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("currency_type", "text", (col,) => col.notNull().defaultTo("gold",),)
    .addColumn("items_offered", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("items_requested", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("trade_type", "text", (col,) => col.notNull().defaultTo("player_player",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("xp_ledger",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("amount", "integer", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("reference_id", "text",)
    .addColumn("chat_id", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_achievements_category",)
    .on("achievements",)
    .column("category",)
    .execute();

  await database.schema
    .createIndex("idx_battles_chat",)
    .on("battles",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_dice_roll_history_user_chat",)
    .on("dice_roll_history",)
    .columns(["user_id", "chat_id",],)
    .execute();

  await database.schema
    .createIndex("idx_loot_entries_table",)
    .on("loot_entries",)
    .column("loot_table_id",)
    .execute();

  await database.schema
    .createIndex("idx_player_achievements_achievement",)
    .on("player_achievements",)
    .column("achievement_id",)
    .execute();

  await database.schema
    .createIndex("idx_player_achievements_player",)
    .on("player_achievements",)
    .column("player_id",)
    .execute();

  await database.schema
    .createIndex("idx_playthroughs_player_world",)
    .on("playthroughs",)
    .columns(["player_id", "world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_xp_ledger_actor",)
    .on("xp_ledger",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("trade_history_buyer_idx",)
    .on("trade_history",)
    .column("buyer_actor_id",)
    .execute();

  await database.schema
    .createIndex("trade_history_seller_idx",)
    .on("trade_history",)
    .column("seller_actor_id",)
    .execute();

  await database.schema
    .createIndex("trade_history_world_idx",)
    .on("trade_history",)
    .column("world_id",)
    .execute();
  // --- parts/011_blog.ts ---
  await database.schema
    .createTable("blog_comments",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .addColumn("parent_comment_id", "text", (col,) => col.references("blog_comments.id",).onDelete("cascade",),)
    .execute();

  await database.schema
    .createTable("blog_follows",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("follower_id", "text", (col,) => col.notNull(),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await database.schema
    .createTable("blog_posts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("public",),)
    .addColumn("author_type", "text", (col,) => col.notNull().defaultTo("human",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("draft",),)
    .addColumn("category", "text",)
    .addColumn("world_id", "text",)
    .addColumn("character_id", "text",)
    .addColumn("scheduled_at", "text",)
    .addColumn("published_at", "text",)
    .addColumn("view_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await database.schema
    .createTable("blog_rag_sources",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("source_type", "text", (col,) => col.notNull(),)
    .addColumn("uri", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("relevance_score", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("snippet", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await database.schema
    .createTable("blog_tags",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("tag", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("blog_comments_parent_idx",)
    .on("blog_comments",)
    .column("parent_comment_id",)
    .execute();

  await database.schema
    .createIndex("blog_follows_unique",)
    .on("blog_follows",)
    .columns(["follower_id", "author_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("blog_rag_sources_post_idx",)
    .on("blog_rag_sources",)
    .column("post_id",)
    .execute();

  await database.schema
    .createIndex("blog_tags_post_idx",)
    .on("blog_tags",)
    .column("post_id",)
    .execute();

  await database.schema
    .createIndex("idx_blog_posts_author",)
    .on("blog_posts",)
    .column("author_id",)
    .execute();
  // --- parts/012_memory.ts ---
  await database.schema
    .createTable("actor_memories",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("source_chat_id", "text", (col,) => col.references("chats.id",),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("memory_type", "text", (col,) => col.notNull().defaultTo("fact",),)
    .addColumn("confidence", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("importance", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("keywords", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("decay_rate", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("strength", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("last_accessed_at", "text",)
    .addColumn("source_message_id", "text",)
    .addColumn("context", "text",)
    .addColumn("world_id", "text",)
    .addColumn("user_id", "text",)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("character",),)
    .addColumn("pinned", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .addColumn("privacy", "text", (col,) => col.notNull().defaultTo("shared",),)
    .addColumn("review_status", "text", (col,) => col.notNull().defaultTo("committed",),)
    .addColumn("shareability", "text",)
    .execute();

  await database.schema
    .createTable("memory_embeddings",)
    .addColumn("memory_id", "text", (col,) => col.primaryKey(),)
    .addColumn("model", "text", (col,) => col.notNull().defaultTo("nomic-embed-text",),)
    .addColumn("dimensions", "integer", (col,) => col.notNull().defaultTo(1536,),)
    .addColumn("vector_blob", "blob", (col,) => col.notNull(),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_actor",)
    .on("actor_memories",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_created_at",)
    .on("actor_memories",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_last_accessed",)
    .on("actor_memories",)
    .column("last_accessed_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_source_chat",)
    .on("actor_memories",)
    .column("source_chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_type",)
    .on("actor_memories",)
    .column("memory_type",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_user_scope",)
    .on("actor_memories",)
    .columns(["user_id", "scope",],)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_world_actor",)
    .on("actor_memories",)
    .columns(["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createIndex("idx_embeddings_model",)
    .on("memory_embeddings",)
    .column("model",)
    .execute();
  // --- parts/013_generation.ts ---
  await database.schema
    .createTable("generation_attempts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("parent_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("idempotency_key", "text", (col,) => col.notNull(),)
    .addColumn("model_id", "text", (col,) => col.notNull(),)
    .addColumn("provider", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("cancel_reason", "text",)
    .addColumn("cancel_reason_detail", "text",)
    .addColumn("cancel_source", "text",)
    .addColumn("abort_signal_id", "text",)
    .addColumn("started_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .addColumn("prompt_tokens", "integer",)
    .addColumn("completion_tokens", "integer",)
    .addColumn("total_tokens", "integer",)
    .addColumn("generation_time_ms", "integer",)
    .addColumn("error_message", "text",)
    .addColumn("streaming_chunks_received", "integer",)
    .addColumn("streaming_chars_received", "integer",)
    .addColumn("repetition_score", "real",)
    .addColumn("repetition_analysis", "text",)
    .addColumn("policy_analysis", "text",)
    .addColumn("response_count_in_turn", "integer",)
    .addColumn("parent_attempt_id", "text", (col,) => col.references("generation_attempts.id",),)
    .addColumn("continuation_count", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("partial_content", "text",)
    .addColumn("step_index", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("total_steps", "integer", (col,) => col.defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_rendered_chunk_index", "integer",)
    .addColumn("delivery_confirmed_at", "text",)
    .addColumn("side_effect_jobs_cancelled", "integer", (col,) => col.defaultTo(0,),)
    .execute();

  await database.schema
    .createTable("synthetic_data",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("source_data", "text", (col,) => col.notNull(),)
    .addColumn("generated_cases", "text", (col,) => col.notNull(),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("generated",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("validated_at", "text",)
    .addColumn("validated_by", "text", (col,) => col.references("actors.id",),)
    .execute();
  await database.schema
    .createTable("generation_jobs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("kind", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("payload", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("results", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("error_message", "text",)
    .addColumn("started_at", "text",)
    .addColumn("completed_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_abort_signal",)
    .on("generation_attempts",)
    .column("abort_signal_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_actor",)
    .on("generation_attempts",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_chat",)
    .on("generation_attempts",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_created_at",)
    .on("generation_attempts",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_idempotency",)
    .on("generation_attempts",)
    .column("idempotency_key",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_parent",)
    .on("generation_attempts",)
    .column("parent_attempt_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_parent_msg",)
    .on("generation_attempts",)
    .column("parent_message_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_status",)
    .on("generation_attempts",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_synthetic_data_chat",)
    .on("synthetic_data",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_synthetic_data_status",)
    .on("synthetic_data",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_synthetic_data_type",)
    .on("synthetic_data",)
    .column("type",)
    .execute();

  await database.schema
    .createIndex("idx_synthetic_data_world",)
    .on("synthetic_data",)
    .column("world_id",)
    .execute();
  await database.schema
    .createIndex("idx_generation_jobs_actor",)
    .on("generation_jobs",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_jobs_status",)
    .on("generation_jobs",)
    .column("status",)
    .execute();
  // ── FEAT-065: unified prompt template library ───────────────
  // One table for all generation modalities (llm/image/video/audio);
  // modality-specific shape lives in the JSON `payload` column.
  await database.schema
    .createTable("prompt_templates",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("modality", "text", (col,) => col.notNull().defaultTo("llm",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("model_family", "text",)
    .addColumn("detail_level", "text", (col,) => col.notNull().defaultTo("balanced",),)
    .addColumn("payload", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_prompt_templates_modality",
      sql`modality IN ('llm', 'image', 'video', 'audio')`,
    )
    .execute();

  // Chat-level LLM prompt template override (beats actors.settings.prompt_template_id).
  await database.schema
    .alterTable("chats",)
    .addColumn("prompt_template_id", "text", (col,) => col.references("prompt_templates.id",).onDelete("set null",),)
    .execute();

  await database.schema
    .createIndex("idx_prompt_templates_owner",)
    .on("prompt_templates",)
    .column("owner_id",)
    .execute();

  await database.schema
    .createIndex("idx_prompt_templates_modality",)
    .on("prompt_templates",)
    .column("modality",)
    .execute();
  // --- parts/014_moderation.ts ---
  await database.schema
    .createTable("content_flags",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("reporter_id", "text", (col,) => col.notNull(),)
    .addColumn("content_type", "text", (col,) => col.notNull(),)
    .addColumn("content_id", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text",)
    .addColumn("world_id", "text",)
    .addColumn("flag_reason", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("resolution", "text",)
    .addColumn("resolved_by", "text",)
    .addColumn("resolved_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await database.schema
    .createTable("location_nsfw_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("location_type", "text", (col,) => col.notNull(),)
    .addColumn("privacy_level", "text", (col,) => col.notNull().defaultTo("private",),)
    .addColumn("discovery_chance", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("atmosphere", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("equipment", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("risks", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_nsfw_config_location", ["location_id",],)
    .execute();

  await database.schema
    .createTable("moderation_actions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("action_type", "text", (col,) => col.notNull(),)
    .addColumn("target_user_id", "text", (col,) => col.notNull(),)
    .addColumn("performed_by", "text", (col,) => col.notNull(),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("scope_id", "text",)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("expires_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .addColumn("superseded_by", "text",)
    .addColumn("deleted_at", "text",)
    .addColumn("deleted_by", "text",)
    .execute();

  await database.schema
    .createTable("moderation_appeals",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("action_id", "text", (col,) => col.notNull().references("moderation_actions.id",).onDelete("cascade",),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("reviewed_by", "text",)
    .addColumn("review_note", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .createTable("nsfw_consent_state",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("nsfw_encounter",),)
    .addColumn("reason", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("revoked_at", "text",)
    .execute();

  await database.schema
    .createTable("nsfw_encounters",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("encounter_type", "text", (col,) => col.notNull(),)
    .addColumn("intensity", "text", (col,) => col.notNull().defaultTo("vanilla",),)
    .addColumn("narrative_style", "text", (col,) => col.notNull().defaultTo("fade_to_black",),)
    .addColumn("participants", "text", (col,) => col.notNull(),)
    .addColumn("phases", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("current_phase", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("outcomes", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("content_tags", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("nsfw_user_preferences",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("nsfw_enabled", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_rating", "text", (col,) => col.notNull().defaultTo("nsfw_mild",),)
    .addColumn("access_status", "text", (col,) => col.notNull().defaultTo("clear",),)
    .addColumn("shadow_nsfw", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("block_reason", "text",)
    .addColumn("banned_at", "text",)
    .addColumn("banned_by", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await database.schema
    .createIndex("content_flags_reporter_idx",)
    .on("content_flags",)
    .column("reporter_id",)
    .execute();

  await database.schema
    .createIndex("content_flags_status_idx",)
    .on("content_flags",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_content_flags_content",)
    .on("content_flags",)
    .columns(["content_type", "content_id",],)
    .execute();

  await database.schema
    .createIndex("idx_content_flags_created_at",)
    .on("content_flags",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_moderation_actions_created_at",)
    .on("moderation_actions",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_nsfw_consent_state_chat",)
    .on("nsfw_consent_state",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_nsfw_consent_state_user",)
    .on("nsfw_consent_state",)
    .column("user_id",)
    .execute();

  await database.schema
    .createIndex("idx_nsfw_consent_state_user_chat_created",)
    .on("nsfw_consent_state",)
    .columns(["user_id", "chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_nsfw_encounters_world",)
    .on("nsfw_encounters",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("mod_actions_deleted_at_idx",)
    .on("moderation_actions",)
    .column("deleted_at",)
    .execute();

  await database.schema
    .createIndex("mod_actions_superseded_idx",)
    .on("moderation_actions",)
    .column("superseded_by",)
    .execute();

  await database.schema
    .createIndex("mod_actions_target_idx",)
    .on("moderation_actions",)
    .column("target_user_id",)
    .execute();

  await database.schema
    .createIndex("mod_actions_type_idx",)
    .on("moderation_actions",)
    .column("action_type",)
    .execute();

  await database.schema
    .createIndex("nsfw_prefs_user_idx",)
    .on("nsfw_user_preferences",)
    .column("user_id",)
    .unique()
    .execute();
  // --- parts/015_e2e.ts ---
  await database.schema
    .createTable("e2e_group_wraps",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("group_session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("wrapped_key", "text", (col,) => col.notNull(),)
    .addColumn("sender_eph_pub_jwk", "text", (col,) => col.notNull(),)
    .addColumn("chain_index", "integer", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("e2e_sessions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("sender_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",),)
    .addColumn("kind", "text", (col,) => col.notNull().defaultTo("pair",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_message_at", "text",)
    .addColumn("revoked_at", "text",)
    .addColumn("root_key", "blob",)
    .addColumn("sending_chain_key", "blob",)
    .addColumn("receiving_chain_key", "blob",)
    .addColumn("send_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("recv_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("ephemeral_public_jwk", "text",)
    .addColumn("ephemeral_private_jwk", "text",)
    .execute();

  await database.schema
    .createTable("e2e_skipped_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("dh_public_jwk", "text", (col,) => col.notNull(),)
    .addColumn("counter", "integer", (col,) => col.notNull(),)
    .addColumn("encrypted_message_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("e2e_skipped_message_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text", (col,) => col.notNull().references("e2e_sessions.id",).onDelete("cascade",),)
    .addColumn("recipient_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("chain_index", "integer", (col,) => col.notNull(),)
    .addColumn("message_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_e2e_group_wraps_recipient",)
    .on("e2e_group_wraps",)
    .columns(["recipient_actor_id", "group_session_id",],)
    .execute();

  await database.schema
    .createIndex("idx_e2e_group_wraps_session_idx",)
    .on("e2e_group_wraps",)
    .columns(["group_session_id", "chain_index",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_e2e_sessions_pair",)
    .on("e2e_sessions",)
    .columns(["sender_actor_id", "recipient_actor_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_e2e_skipped_keys_session_expires",)
    .on("e2e_skipped_keys",)
    .columns(["session_id", "expires_at",],)
    .execute();

  await database.schema
    .createIndex("idx_skipped_keys_age",)
    .on("e2e_skipped_message_keys",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_skipped_keys_lookup",)
    .on("e2e_skipped_message_keys",)
    .columns(["session_id", "recipient_actor_id", "chain_index",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("uniq_e2e_skipped_keys_session_ephemeral_counter",)
    .on("e2e_skipped_keys",)
    .columns(["session_id", "dh_public_jwk", "counter",],)
    .execute();
  // --- parts/016_fts.ts ---
  await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(
        memory_id UNINDEXED,
        content
      )`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_ad
      AFTER DELETE ON actor_memories BEGIN
        DELETE FROM memories_fts WHERE memory_id = old.id;
      END`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_ai
      AFTER INSERT ON actor_memories BEGIN
        INSERT INTO memories_fts(memory_id, content)
        VALUES (new.id, new.content);
      END`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_au
      AFTER UPDATE OF content ON actor_memories BEGIN
        DELETE FROM memories_fts WHERE memory_id = old.id;
        INSERT INTO memories_fts(memory_id, content)
        VALUES (new.id, new.content);
      END`.execute(database,);

  await sql`CREATE VIRTUAL TABLE messages_fts USING fts5(
        message_id UNINDEXED,
        chat_id UNINDEXED,
        content,
        tokenize = 'porter unicode61'
      )`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_ad
      AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
      END`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_ai
      AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(message_id, chat_id, content)
        VALUES (new.id, new.chat_id, new.content_plaintext);
      END`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_au
      AFTER UPDATE OF content_plaintext ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
        INSERT INTO messages_fts(message_id, chat_id, content)
        VALUES (new.id, new.chat_id, new.content_plaintext);
      END`.execute(database,);

  await database.schema
    .alterTable("users",)
    .addColumn("encryption_secret", "text",)
    .execute();

  await database.schema
    .createTable("message_search_tokens",)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("token", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_message_search_tokens", ["message_id", "token",],)
    .execute();

  await database.schema
    .createIndex("idx_message_search_tokens_lookup",)
    .on("message_search_tokens",)
    .columns(["scope", "token",],)
    .execute();
  // --- parts/019_trade_requested_materials.ts ---
  await database.schema
    .alterTable("crafting_orders",)
    .addColumn("requested_materials", "text", (col,) => col.notNull().defaultTo("[]",),)
    .execute();
  // --- parts/020_workflow_sessions.ts ---
  await database.schema
    .createTable("workflow_sessions",)
    .addColumn("chat_id", "text", (col,) => col.primaryKey().references("chats.id",).onDelete("cascade",),)
    .addColumn("workflow_id", "text", (col,) => col.notNull(),)
    .addColumn("step_values", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("confirmed", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // Coordinator role (mesh-followup decision): peer registry + negotiation
  // state. Metadata/control plane only — never plaintext content.
  await database.schema
    .createTable("mesh_peers",)
    .addColumn("origin", "text", (col,) => col.primaryKey(),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("capabilities", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("last_seen", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createTable("mesh_negotiations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull().references("mesh_peers.origin",).onDelete("cascade",),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("idle",),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  // --- parts/022_mesh_sharing.ts ---
  await database.schema
    .createTable("mesh_reservations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull().references("mesh_peers.origin",).onDelete("cascade",),)
    .addColumn("content_hash", "text", (col,) => col.notNull(),)
    .addColumn("size_bytes", "integer", (col,) => col.notNull(),)
    .addColumn("content_type", "text", (col,) => col.notNull().defaultTo("blob",),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("reserved",),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createTable("mesh_deliveries",)
    .addColumn("content_id", "text", (col,) => col.primaryKey(),)
    .addColumn("origin", "text", (col,) => col.notNull(),)
    .addColumn("content_hash", "text", (col,) => col.notNull(),)
    .addColumn("clock", "integer", (col,) => col.notNull(),)
    .addColumn("received_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // --- 002_mesh_capacity.ts ---
  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("capacity_bytes", "integer",)
    .execute();

  // --- 003_mesh_inbound_keys.ts ---
  await database.schema
    .createTable("mesh_inbound_keys",)
    .addColumn("peer_origin", "text", (col,) => col.primaryKey(),)
    .addColumn("encrypted_key", "text", (col,) => col.notNull(),)
    .addColumn("previous_encrypted_key", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // --- 004_world_mechanics.ts ---
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_dice", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_checks", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_combat", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_loot", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_quests", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  // Parity backfill: worlds that opted into RPG keep every mechanic on.
  await sql`UPDATE worlds SET rpg_dice = rpg_enabled, rpg_checks = rpg_enabled, rpg_combat = rpg_enabled, rpg_xp = rpg_enabled, rpg_loot = rpg_enabled, rpg_quests = rpg_enabled`
    .execute(database,);

  // --- 005_asset_tags.ts ---
  await database.schema
    .createTable("asset_tags",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("tag", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("user",),)
    .addColumn("owner_id", "text",)
    .addColumn("source", "text", (col,) => col.notNull().defaultTo("manual",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("asset_tag_dismissals",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("tag", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_asset_tags_asset",)
    .on("asset_tags",)
    .column("asset_id",)
    .execute();

  await database.schema
    .createIndex("idx_asset_tags_global_unique",)
    .on("asset_tags",)
    .columns(["asset_id", "tag",],)
    .where(sql<boolean>`scope = 'global'`,)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_asset_tags_user_unique",)
    .on("asset_tags",)
    .columns(["asset_id", "tag", "owner_id",],)
    .where(sql<boolean>`scope = 'user'`,)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_asset_tag_dismissals_asset_user",)
    .on("asset_tag_dismissals",)
    .columns(["asset_id", "user_id",],)
    .execute();

  await database.schema
    .createIndex("idx_asset_tag_dismissals_unique",)
    .on("asset_tag_dismissals",)
    .columns(["asset_id", "tag", "user_id",],)
    .unique()
    .execute();

  // --- 006_rotation_history.ts ---
  await database.schema
    .createTable("rotation_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("old_key_id", "text",)
    .addColumn(
      "new_key_id",
      "text",
      (col,) => col.notNull().references("chat_keys.id",).onDelete("restrict",).onUpdate("cascade",),
    )
    .addColumn("messages_re_encrypted", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createIndex("rotation_history_chat_id_created_at_idx",)
    .on("rotation_history",)
    .columns(["chat_id", "created_at",],)
    .execute();

  // --- 007_add_chat_gm_role.ts ---

  // --- 008_memory_source_chain.ts ---
  await database.schema
    .alterTable("actor_memories",)
    .addColumn("source_message_ids", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("source_chat_ids", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("extraction_kind", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("context_window_start", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("context_window_end", "text",)
    .execute();

  // Backfill: legacy single source_message_id → one-element JSON array.
  // Rows with NULL/empty source_message_id keep NULL (unbound memories).
  await sql`UPDATE actor_memories
      SET source_message_ids = json_array(source_message_id)
      WHERE source_message_id IS NOT NULL AND source_message_id != ''`.execute(database,);

  // Backfill source_chat_ids from source_chat_id where present.
  await sql`UPDATE actor_memories
      SET source_chat_ids = json_array(source_chat_id)
      WHERE source_chat_id IS NOT NULL AND source_chat_id != ''`.execute(database,);

  await database.schema
    .createIndex("idx_actor_memories_source_msg_ids",)
    .on("actor_memories",)
    .column("source_message_ids",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_source_chat_ids",)
    .on("actor_memories",)
    .column("source_chat_ids",)
    .execute();

  // --- 009_chat_moderation_state.ts ---
  await database.schema
    .alterTable("chat_participants",)
    .addColumn("muted_until", "text",)
    .execute();

  await database.schema
    .alterTable("chat_participants",)
    .addColumn("banned_until", "text",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_muted_until",)
    .on("chat_participants",)
    .column("muted_until",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_banned_until",)
    .on("chat_participants",)
    .column("banned_until",)
    .execute();

  // --- 010_quest_reward_ledger.ts ---
  await database.schema
    .createTable("quest_reward_ledger",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("ledger_key", "text", (col,) => col.notNull(),)
    .addColumn("world_item_ids", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_quest_reward_ledger_unique",)
    .on("quest_reward_ledger",)
    .columns(["world_id", "ledger_key",],)
    .unique()
    .execute();

  // --- 011_character_license_history.ts ---
  await database.schema
    .createTable("character_license_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("license_type", "text", (col,) => col.notNull(),)
    .addColumn("custom_license_text", "text",)
    .addColumn("attribution", "text",)
    .addColumn("allow_derivatives", "integer", (col,) => col.notNull(),)
    .addColumn("allow_commercial", "integer", (col,) => col.notNull(),)
    .addColumn("share_alike", "integer", (col,) => col.notNull(),)
    .addColumn("changed_by", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_character_license_history_actor",)
    .on("character_license_history",)
    .columns(["actor_id", "created_at",],)
    .execute();

  // --- 013_locations_fractal.ts ---
  // ── 1. ALTER locations: one column per statement ──
  await database.schema
    .alterTable("locations",)
    .addColumn("kind", "text", (col,) => col.notNull().defaultTo(LocationKind.Region,),)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("mobility_mode", "text", (col,) => col.notNull().defaultTo(MobilityMode.Static,),)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("path", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("coord_x", "real",)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("coord_y", "real",)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("coord_z", "real",)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("current_route_id", "text",)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("travel_progress", "real", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  // ── 2. Indexes on the new columns ──
  await database.schema
    .createIndex("idx_locations_path",)
    .on("locations",)
    .column("path",)
    .execute();
  await database.schema
    .createIndex("idx_locations_kind",)
    .on("locations",)
    .column("kind",)
    .execute();
  await database.schema
    .createIndex("idx_locations_current_route",)
    .on("locations",)
    .column("current_route_id",)
    .execute();
  // Unique world+path index (SQLite uses CREATE UNIQUE INDEX, not ALTER TABLE ADD CONSTRAINT).
  await database.schema
    .createIndex("uq_locations_world_path",)
    .on("locations",)
    .columns(["world_id", "path",],)
    .unique()
    .execute();

  // ── 3. travel_routes table ──
  await database.schema
    .createTable("travel_routes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("kind", "text", (col,) => col.notNull(),)
    .addColumn("waypoints", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("loop", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("seconds_per_unit", "integer", (col,) => col.notNull().defaultTo(60,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // ── 4. travel_route_stops table ──
  await database.schema
    .createTable("travel_route_stops",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("route_id", "text", (col,) => col.notNull().references("travel_routes.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("stop_order", "integer", (col,) => col.notNull(),)
    .addColumn("dwell_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("coord_x", "real",)
    .addColumn("coord_y", "real",)
    .addColumn("coord_z", "real",)
    .addUniqueConstraint("uq_route_stops_order", ["route_id", "stop_order",],)
    .execute();

  // ── 5. actor_locations table ──
  await database.schema
    .createTable("actor_locations",)
    .addColumn("actor_id", "text", (col,) => col.primaryKey(),)
    .addColumn("physical_location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("spatial_location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("entered_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createIndex("idx_actor_locations_physical",)
    .on("actor_locations",)
    .column("physical_location_id",)
    .execute();
  await database.schema
    .createIndex("idx_actor_locations_spatial",)
    .on("actor_locations",)
    .column("spatial_location_id",)
    .execute();

  // ── 6. Triggers (INSERT-time; UPDATE-time checks live in LocationTreeService) ──

  // 6.1 — Reject self-parent.
  await sql`CREATE TRIGGER trg_locations_no_self_parent
      BEFORE INSERT ON locations
      WHEN new.parent_location_id IS NOT NULL AND new.parent_location_id = new.id
      BEGIN
        SELECT RAISE(ABORT, 'location cannot be its own parent');
      END`.execute(database,);

  // 6.2 — Depth limit is enforced at the application layer (see LocationTreeService).
  // A pure SQL trigger is awkward: the recursive depth check via parent path lookup does not
  // survive SQLite's trigger parser when nested in CASE/WHEN expressions. The service path
  // already computes depth for ancestors/descendants; a single SELECT before INSERT is cheap.
  // Documented invariant: a Location's depth (seps in path) must be ≤ LOCATION_DEPTH_LIMIT.

  // 6.3 — Cross-world parent rejected.
  await sql`CREATE TRIGGER trg_locations_cross_world_parent
      BEFORE INSERT ON locations
      WHEN new.parent_location_id IS NOT NULL
        AND (SELECT world_id FROM locations WHERE id = new.parent_location_id) <> new.world_id
      BEGIN
        SELECT RAISE(ABORT, 'cross-world parent rejected');
      END`.execute(database,);

  // 6.4 — Set path on insert via AFTER INSERT. Single trigger handles both root and child.
  // SQLite triggers cannot use SET new.col; instead UPDATE the just-inserted row.
  await sql`CREATE TRIGGER trg_locations_set_path_on_insert
      AFTER INSERT ON locations
      BEGIN
        UPDATE locations
          SET path = CASE
            WHEN new.parent_location_id IS NULL THEN '/' || new.id || '/'
            ELSE (SELECT path FROM locations WHERE id = new.parent_location_id) || new.id || '/'
          END
          WHERE id = new.id;
      END`.execute(database,);

  // 6.5 — On parent update, recursively rewrite every descendant's path.
  // Walk subtree via recursive CTE, then bulk-update paths for each.
  await sql`CREATE TRIGGER trg_locations_set_path_on_update
      AFTER UPDATE OF parent_location_id ON locations
      WHEN new.parent_location_id IS NULL OR
           (SELECT path FROM locations WHERE id = new.parent_location_id) IS NOT NULL
      BEGIN
        -- Rewrite the moved row itself.
        UPDATE locations
          SET path = CASE
            WHEN new.parent_location_id IS NULL THEN '/' || new.id || '/'
            ELSE (SELECT path FROM locations l2 WHERE l2.id = new.parent_location_id) || new.id || '/'
          END
          WHERE id = new.id;
        -- Rewrite every descendant (recursive walk).
        UPDATE locations
          SET path = (SELECT l2.path FROM locations l2 WHERE l2.id = locations.parent_location_id) || locations.id || '/'
          WHERE id IN (
            WITH RECURSIVE sub(id) AS (
              SELECT id FROM locations WHERE parent_location_id = new.id AND id <> new.id
              UNION ALL
              SELECT l.id FROM locations l JOIN sub s ON l.parent_location_id = s.id
            )
            SELECT id FROM sub
          );
      END`.execute(database,);

  // ── 7. Backfill: every existing row gets path + defaults ──
  await sql`UPDATE locations SET path = '/' || id || '/' WHERE path = '' OR path IS NULL`.execute(
    database,
  );

  // ── 8. Backfill actor_locations from existing npc_states.location_id ──
  await sql`INSERT OR IGNORE INTO actor_locations (actor_id, physical_location_id, spatial_location_id)
      SELECT actor_id, location_id, location_id FROM npc_states WHERE location_id IS NOT NULL`.execute(
    database,
  );

  // --- 014_asset_thumbnail.ts ---
  if (!(await hasThumbnailColumn(database,))) {
    await database.schema
      .alterTable("assets",)
      .addColumn("thumbnail_path", "text",)
      .execute();
  }

  // --- 015_avatar_focus.ts ---
  await database.schema
    .alterTable("actors",)
    .addColumn("avatar_focus_x", "real", (col,) => col.notNull().defaultTo(50,),)
    .execute();

  await database.schema
    .alterTable("actors",)
    .addColumn("avatar_focus_y", "real", (col,) => col.notNull().defaultTo(50,),)
    .execute();

  // --- 016_rpg_questions.ts ---
  await database.schema
    .createTable("rpg_questions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("prompt", "text", (col,) => col.notNull(),)
    .addColumn("options", "text", (col,) => col.notNull(),)
    .addColumn("time_limit", "integer",)
    .addColumn("required_choice", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("open",),)
    .addColumn("selected_option_id", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("answered_at", "text",)
    .execute();

  await database.schema
    .createIndex("idx_rpg_questions_chat_status",)
    .on("rpg_questions",)
    .columns(["chat_id", "status",],)
    .execute();

  // --- 017_memory_audit_log.ts ---
  await database.schema
    .createTable("memory_audit_log",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("memory_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text",)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("details", "text", (col,) => col.notNull().defaultTo(sql`('{}')`,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_memory_audit_log_memory",)
    .on("memory_audit_log",)
    .columns(["memory_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_memory_audit_log_actor",)
    .on("memory_audit_log",)
    .columns(["actor_id", "created_at",],)
    .execute();

  // --- 018_content_flags_unique_pending.ts ---
  await sql`
      CREATE UNIQUE INDEX content_flags_open_unique
      ON content_flags (content_type, content_id)
      WHERE status IN ('pending', 'under_review')
    `.execute(database,);

  // --- 023_status_effects.ts ---
  await database.schema
    .createTable("status_effect",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("effect_id", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("affected_stat", "text",)
    .addColumn("magnitude", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text",)
    .addColumn("started_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("meta", "text",)
    .execute();
  await database.schema
    .createIndex("idx_status_effect_actor_effect",)
    .on("status_effect",)
    .columns(["actor_id", "effect_id",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // --- 023_status_effects.ts down ---
  await database.schema.dropTable("status_effect",).execute();
  // --- 018_content_flags_unique_pending.ts down ---
  await sql`DROP INDEX IF EXISTS content_flags_open_unique`.execute(database,);

  // --- 017_memory_audit_log.ts down ---
  await database.schema.dropTable("memory_audit_log",).execute();
  // --- 016_rpg_questions.ts down ---
  await database.schema.dropTable("rpg_questions",).execute();
  // --- 015_avatar_focus.ts down ---
  await database.schema.alterTable("actors",).dropColumn("avatar_focus_y",).execute();
  await database.schema.alterTable("actors",).dropColumn("avatar_focus_x",).execute();

  // --- 014_asset_thumbnail.ts down ---
  // Match the original down(): drop the column only if present. Fresh DBs
  // that ran only this migration drop cleanly; DBs that ran both the old
  // and new migrations see a no-op rather than a duplicate-drop error.
  if (await hasThumbnailColumn(database,)) {
    await database.schema
      .alterTable("assets",)
      .dropColumn("thumbnail_path",)
      .execute();
  }

  // --- 013_locations_fractal.ts down ---
  // Triggers (reverse order — must be dropped BEFORE the columns they reference).
  await sql`DROP TRIGGER IF EXISTS trg_locations_set_path_on_update`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_set_path_on_insert`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_cross_world_parent`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_no_self_parent`.execute(database,);

  // Tables (reverse FK order).
  await database.schema.dropTable("actor_locations",).execute();
  await database.schema.dropTable("travel_route_stops",).execute();
  await database.schema.dropTable("travel_routes",).execute();

  // Indexes + unique index on locations.
  await database.schema.dropIndex("uq_locations_world_path",).ifExists().execute();
  await database.schema.dropIndex("idx_locations_current_route",).ifExists().execute();
  await database.schema.dropIndex("idx_locations_kind",).ifExists().execute();
  await database.schema.dropIndex("idx_locations_path",).ifExists().execute();

  // Columns (reverse declaration order).
  await database.schema.alterTable("locations",).dropColumn("travel_progress",).execute();
  await database.schema.alterTable("locations",).dropColumn("current_route_id",).execute();
  await database.schema.alterTable("locations",).dropColumn("coord_z",).execute();
  await database.schema.alterTable("locations",).dropColumn("coord_y",).execute();
  await database.schema.alterTable("locations",).dropColumn("coord_x",).execute();
  await database.schema.alterTable("locations",).dropColumn("path",).execute();
  await database.schema.alterTable("locations",).dropColumn("mobility_mode",).execute();
  await database.schema.alterTable("locations",).dropColumn("kind",).execute();

  // --- 011_character_license_history.ts down ---
  await database.schema.dropTable("character_license_history",).execute();

  // --- 010_quest_reward_ledger.ts down ---
  await database.schema.dropTable("quest_reward_ledger",).execute();

  // --- 009_chat_moderation_state.ts down ---
  await database.schema.dropIndex("idx_chat_participants_banned_until",).execute();
  await database.schema.dropIndex("idx_chat_participants_muted_until",).execute();
  await database.schema.alterTable("chat_participants",).dropColumn("banned_until",).execute();
  await database.schema.alterTable("chat_participants",).dropColumn("muted_until",).execute();

  // --- 008_memory_source_chain.ts down ---
  await database.schema
    .dropIndex("idx_actor_memories_source_chat_ids",)
    .execute();

  await database.schema
    .dropIndex("idx_actor_memories_source_msg_ids",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("context_window_end",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("context_window_start",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("extraction_kind",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("source_chat_ids",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .dropColumn("source_message_ids",)
    .execute();

  // --- 007_add_chat_gm_role.ts down ---
  // The `gm` value is just text — there is no schema object to drop; rows
  // whose `role_in_chat = "gm"` survived a downgrade are a data concern for
  // a newer migration or manual cleanup. The ledger row, however, comes off
  // so a rollback keeps `schema_version` truthful.

  // --- 006_rotation_history.ts down ---
  await database.schema.dropTable("rotation_history",).execute();

  // --- 005_asset_tags.ts down ---
  await database.schema.dropTable("asset_tag_dismissals",).execute();
  await database.schema.dropTable("asset_tags",).execute();

  // --- 004_world_mechanics.ts down ---
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_quests",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_loot",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_xp",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_combat",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_checks",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_dice",)
    .execute();

  // --- 003_mesh_inbound_keys.ts down ---
  await database.schema.dropTable("mesh_inbound_keys",).execute();

  // --- 002_mesh_capacity.ts down ---
  await database.schema.alterTable("mesh_peers",).dropColumn("capacity_bytes",).execute();

  // --- parts/022_mesh_sharing.ts down ---
  await database.schema.dropTable("mesh_deliveries",).execute();
  await database.schema.dropTable("mesh_reservations",).execute();
  // --- parts/020_workflow_sessions.ts down ---
  await database.schema.dropTable("mesh_negotiations",).execute();
  await database.schema.dropTable("mesh_peers",).execute();
  await database.schema.dropTable("workflow_sessions",).execute();
  // --- parts/019_trade_requested_materials.ts down ---
  await database.schema
    .alterTable("crafting_orders",)
    .dropColumn("requested_materials",)
    .execute();
  // --- parts/016_fts.ts down ---
  await database.schema.dropTable("message_search_tokens",).execute();

  await database.schema
    .alterTable("users",)
    .dropColumn("encryption_secret",)
    .execute();

  await sql`DROP TRIGGER IF EXISTS messages_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_au`.execute(database,);
  await sql`DROP TABLE IF EXISTS memories_fts`.execute(database,);
  await sql`DROP TABLE IF EXISTS messages_fts`.execute(database,);
  // --- parts/015_e2e.ts down ---
  await database.schema.dropTable("e2e_skipped_message_keys",).execute();
  await database.schema.dropTable("e2e_skipped_keys",).execute();
  await database.schema.dropTable("e2e_group_wraps",).execute();
  await database.schema.dropTable("e2e_sessions",).execute();
  // --- parts/014_moderation.ts down ---
  await database.schema.dropTable("nsfw_user_preferences",).execute();
  await database.schema.dropTable("nsfw_encounters",).execute();
  await database.schema.dropTable("nsfw_consent_state",).execute();
  await database.schema.dropTable("moderation_appeals",).execute();
  await database.schema.dropTable("location_nsfw_config",).execute();
  await database.schema.dropTable("content_flags",).execute();
  await database.schema.dropTable("moderation_actions",).execute();
  // --- parts/013_generation.ts down ---
  await database.schema
    .alterTable("chats",)
    .dropColumn("prompt_template_id",)
    .execute();
  await database.schema.dropTable("prompt_templates",).execute();
  await database.schema.dropTable("synthetic_data",).execute();
  await database.schema.dropTable("generation_jobs",).execute();
  await database.schema.dropTable("generation_attempts",).execute();
  // --- parts/012_memory.ts down ---
  await database.schema.dropTable("memory_embeddings",).execute();
  await database.schema.dropTable("actor_memories",).execute();
  // --- parts/011_blog.ts down ---
  await database.schema.dropTable("blog_tags",).execute();
  await database.schema.dropTable("blog_rag_sources",).execute();
  await database.schema.dropTable("blog_follows",).execute();
  await database.schema.dropTable("blog_comments",).execute();
  await database.schema.dropTable("blog_posts",).execute();
  // --- parts/010_progression.ts down ---
  await database.schema.dropTable("xp_ledger",).execute();
  await database.schema.dropTable("trade_history",).execute();
  await database.schema.dropTable("playthroughs",).execute();
  await database.schema.dropTable("player_achievements",).execute();
  await database.schema.dropTable("loot_tables",).execute();
  await database.schema.dropTable("loot_entries",).execute();
  await database.schema.dropTable("dice_roll_history",).execute();
  await database.schema.dropTable("battles",).execute();
  await database.schema.dropTable("achievements",).execute();
  // --- parts/009_crafting.ts down ---
  await database.schema.dropTable("recipe_discoveries",).execute();
  await database.schema.dropTable("profession_specializations",).execute();
  await database.schema.dropTable("gathering_node_materials",).execute();
  await database.schema.dropTable("gathering_node_instances",).execute();
  await database.schema.dropTable("crafting_recipe_materials",).execute();
  await database.schema.dropTable("crafting_orders",).execute();
  await database.schema.dropTable("crafting_attempts",).execute();
  await database.schema.dropTable("professions",).execute();
  await database.schema.dropTable("gathering_node_defs",).execute();
  await database.schema.dropTable("crafting_station_instances",).execute();
  await database.schema.dropTable("crafting_recipes",).execute();
  await database.schema.dropTable("crafting_station_defs",).execute();
  // --- parts/008_story.ts down ---
  await database.schema.dropTable("whitenotes",).execute();
  await database.schema.dropTable("shadow_notes",).execute();
  await database.schema.dropTable("quest_progress",).execute();
  await database.schema.dropTable("npc_states",).execute();
  await database.schema.dropTable("items",).execute();
  await database.schema.dropTable("quests",).execute();
  // --- parts/007_personas.ts down ---
  await database.schema.dropTable("personas",).execute();
  // --- parts/006_chat.ts down ---
  await database.schema.dropTable("vn_choices",).execute();
  await database.schema.dropTable("story_turns",).execute();
  await database.schema.dropTable("proactive_messaging_config",).execute();
  await database.schema.dropTable("music_links",).execute();
  await database.schema.dropTable("message_translations",).execute();
  await database.schema.dropTable("message_seen",).execute();
  await database.schema.dropTable("message_reactions",).execute();
  await database.schema.dropTable("group_initiatives",).execute();
  await database.schema.dropTable("chat_random_events",).execute();
  await database.schema.dropTable("chat_pins",).execute();
  await database.schema.dropTable("chat_participants",).execute();
  await database.schema.dropTable("chat_mentions",).execute();
  await database.schema.dropTable("chat_location_events",).execute();
  await database.schema.dropTable("chat_keys",).execute();
  await database.schema.dropTable("chat_invites",).execute();
  await database.schema.dropTable("chat_background_assignments",).execute();
  await database.schema.dropTable("messages",).execute();
  await database.schema.dropTable("chat_sections",).execute();
  await database.schema.dropTable("chats",).execute();
  await database.schema.dropTable("chat_backgrounds",).execute();
  await database.schema.dropTable("chat_setup_templates",).execute();
  // --- parts/005_characters.ts down ---
  await database.schema.dropTable("mood_events",).execute();
  await database.schema.dropTable("characters",).execute();
  await database.schema.dropTable("character_world_traits",).execute();
  await database.schema.dropTable("character_world_setup",).execute();
  await database.schema.dropTable("character_stats",).execute();
  await database.schema.dropTable("character_skills",).execute();
  await database.schema.dropTable("character_seduction_skills",).execute();
  await database.schema.dropTable("character_relationships",).execute();
  await database.schema.dropTable("character_permanent_traits",).execute();
  await database.schema.dropTable("character_mood",).execute();
  await database.schema.dropTable("character_location_traits",).execute();
  await database.schema.dropTable("character_licensing",).execute();
  await database.schema.dropTable("character_intimacy",).execute();
  await database.schema.dropTable("character_internal_traits",).execute();
  await database.schema.dropTable("character_heat_cycle",).execute();
  await database.schema.dropTable("character_fantasies",).execute();
  await database.schema.dropTable("character_emotions",).execute();
  await database.schema.dropTable("character_desire_profile",).execute();
  await database.schema.dropTable("character_body_profile",).execute();
  await database.schema.dropTable("character_avatars",).execute();
  await database.schema.dropTable("character_avatar_config",).execute();
  await database.schema.dropTable("character_availability",).execute();
  await database.schema.dropTable("character_arousal",).execute();
  await database.schema.dropTable("growth_log",).execute();
  await database.schema.dropTable("character_arc",).execute();
  await database.schema.dropTable("emotions",).execute();
  // --- parts/004_actors.ts down ---
  await database.schema.dropTable("admin_character_overrides",).execute();
  await database.schema.dropTable("actor_notes",).execute();
  await database.schema.dropTable("actor_lore_entries",).execute();
  await database.schema.dropTable("actor_keys",).execute();
  await database.schema.dropTable("actor_items",).execute();
  await database.schema.dropTable("actor_e2e_pubkeys",).execute();
  await database.schema.dropTable("actor_currencies",).execute();
  await database.schema.dropTable("activitypub_actor_keys",).execute();
  await database.schema.dropTable("actors",).execute();
  // --- parts/003_worlds.ts down ---
  await database.schema.dropTable("world_timelines",).execute();
  await database.schema.dropTable("world_event_steerings",).execute();
  await database.schema.dropTable("world_timeline_events",).execute();
  await database.schema.dropTable("world_states",).execute();
  await database.schema.dropTable("world_members",).execute();
  await database.schema.dropTable("world_lore_entries",).execute();
  await database.schema.dropTable("world_items",).execute();
  await database.schema.dropTable("world_invites",).execute();
  await database.schema.dropTable("world_avatar_config",).execute();
  await database.schema.dropTable("location_states",).execute();
  await database.schema.dropTable("locations",).execute();
  await database.schema.dropTable("worlds",).execute();
  // --- parts/002_assets.ts down ---
  await database.schema.dropTable("asset_transforms",).execute();
  await database.schema.dropTable("asset_shares",).execute();
  await database.schema.dropTable("asset_links",).execute();
  await database.schema.dropTable("assets",).execute();
  // --- parts/001_core.ts down ---
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
