// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 001_core — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("data_migrations",)
    .addColumn("table_name", "text", (col,) => col.notNull(),)
    .addColumn("from_version", "integer", (col,) => col.notNull(),)
    .addColumn("to_version", "integer", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("applied_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addPrimaryKeyConstraint("pk_data_migrations", ["table_name", "to_version",],)
    .execute();

  await database.schema
    .createTable("log_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("level", "integer", (col,) => col.defaultTo(20,).notNull(),)
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
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("meta_progression",)
    .addColumn("player_id", "text", (col,) => col.primaryKey().references("users.id",).onDelete("cascade",),)
    .addColumn("total_playthroughs", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("endings_seen", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("secrets_found", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("achievements_unlocked", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("permanent_bonuses", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("unlocked_content", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("notifications",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("body", "text",)
    .addColumn("link", "text",)
    .addColumn("read", "text", (col,) => col.defaultTo("unread",).notNull(),)
    .addColumn("data", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
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
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
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
    .addColumn("secret_hash", "text", (col,) => col.notNull(),)
    .addColumn("ip", "text",)
    .addColumn("user_agent", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_activity", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("system_config",)
    .addColumn("key", "text", (col,) => col.primaryKey(),)
    .addColumn("value", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("telemetry_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("session_id", "text",)
    .addColumn("user_id", "text",)
    .addColumn("chat_id", "text",)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("event_data", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("source", "text", (col,) => col.defaultTo("server",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("user_api_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("provider_name", "text", (col,) => col.notNull(),)
    .addColumn("api_key_encrypted", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("key_version", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .execute();

  await database.schema
    .createTable("users",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("username", "text", (col,) => col.notNull().unique(),)
    .addColumn("display_name", "text", (col,) => col.notNull(),)
    .addColumn("secret_hash", "text",)
    .addColumn("role", "text", (col,) => col.defaultTo("user",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("settings", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("birth_date", "text",)
    .addColumn("age_gate_accepted_at", "text",)
    .addColumn("row_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_seen_at", "text",)
    .addColumn("encryption_secret", "text",)
    .addCheckConstraint(
      "ck_users_role",
      sql`role IN ('admin','moderator','user','creator','player','viewer','guest','bot','tester','custom','solo')`,
    )
    .execute();

  await database.schema
    .createTable("activitypub_actor_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("key_id", "text", (col,) => col.notNull(),)
    .addColumn("public_jwk", "text", (col,) => col.notNull(),)
    .addColumn("encrypted_private_jwk", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("rotated_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text",)
    .addForeignKeyConstraint(
      "fk_ap_actor_keys_actor",
      ["actor_id",],
      "actors",
      ["id",],
      (fk,) => fk.onDelete("cascade",),
    )
    .execute();

  await database.schema
    .createTable("growth_log",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("axis", "text", (col,) => col.notNull(),)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("applied",).notNull(),)
    .addColumn("subject_kind", "text",)
    .addColumn("subject_id", "text",)
    .addColumn("before_json", "text",)
    .addColumn("after_json", "text",)
    .addColumn("reason", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("source_event_id", "text",)
    .addColumn("recorded_at", "text", (col,) => col.notNull(),)
    .addColumn("confirmed_at", "text",)
    .addColumn("confirmed_by", "text",)
    .addColumn("created_at", "text",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .createTable("proactive_messaging_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("frequency", "text", (col,) => col.defaultTo("normal",).notNull(),)
    .addColumn("quiet_hours_start", "text",)
    .addColumn("quiet_hours_end", "text",)
    .addColumn("enabled", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("last_proactive_at", "text",)
    .addColumn("backoff_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("config_json", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("synthetic_data",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("source_data", "text", (col,) => col.notNull(),)
    .addColumn("generated_cases", "text", (col,) => col.notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("generated",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("validated_at", "text",)
    .addColumn("validated_by", "text", (col,) => col.references("actors.id",),)
    .execute();

  await database.schema
    .createTable("task_dependencies",)
    .addColumn("task_id", "text", (col,) => col.notNull(),)
    .addColumn("depends_on_task_id", "text", (col,) => col.notNull(),)
    .addColumn("on_failure", "text", (col,) => col.defaultTo("skip",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addPrimaryKeyConstraint("pk_task_dependencies", ["task_id", "depends_on_task_id",],)
    .addCheckConstraint("ck_task_dependencies_on_failure", sql`on_failure IN ('skip','retry')`,)
    .addCheckConstraint("ck_task_dependencies_not_self", sql`task_id <> depends_on_task_id`,)
    .execute();

  await database.schema
    .createTable("scheduled_messages",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("author_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("send_at", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("pending",).notNull(),)
    .execute();

  await database.schema
    .createTable("message_reminders",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("remind_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("plan_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("state", "text", (col,) => col.defaultTo("todo",).notNull(),)
    .addColumn("kind", "text", (col,) => col.defaultTo("step",).notNull(),)
    .addColumn("position", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("parent_id", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("plan_links",)
    .addColumn("from_id", "text", (col,) => col.notNull().references("plan_items.id",).onDelete("cascade",),)
    .addColumn("to_id", "text", (col,) => col.notNull().references("plan_items.id",).onDelete("cascade",),)
    .addColumn("relation", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addPrimaryKeyConstraint("pk_plan_links", ["from_id", "to_id", "relation",],)
    .execute();

  await database.schema
    .createTable("backup_records",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("resource_type", "text", (col,) => col.notNull(),)
    .addColumn("owner_id", "text", (col,) => col.notNull(),)
    .addColumn("content_hash", "text", (col,) => col.notNull(),)
    .addColumn("server_hash", "text",)
    .addColumn("payload", "text", (col,) => col.notNull(),)
    .addColumn("version", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("storage_quota_bytes", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .execute();

  await database.schema
    .createTable("ranking_snapshots",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_key", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("version", "text", (col,) => col.notNull(),)
    .addColumn("checksum", "text",)
    .addColumn("fetched_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("next_refresh_after", "text", (col,) => col.notNull(),)
    .addColumn("row_count", "integer",)
    .addColumn("payload", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("ok",).notNull(),)
    .addColumn("last_error", "text",)
    .addColumn("meta", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .execute();

  await database.schema
    .createTable("tool_call_audit",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("tool", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("user_id", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("verdict", "text", (col,) => col.notNull(),)
    .addColumn("rationale", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("escalation_attempt", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("required_role", "text",)
    .addColumn("tags", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("duration_ms", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("integration_tokens",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("token_hash", "text", (col,) => col.notNull().unique(),)
    .addColumn("scopes", "text", (col,) => col.notNull(),)
    .addColumn("issuer_admin_user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_used_at", "text",)
    .addColumn("revoked_at", "text",)
    .addColumn("expires_at", "text",)
    .execute();

  await database.schema
    .createTable("harness_queue_turns",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("batch_id", "text", (col,) => col.notNull(),)
    .addColumn("profile", "text", (col,) => col.notNull(),)
    .addColumn("prompt", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("queued",).notNull(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("requested_by", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("requested_role", "text",)
    .addColumn("turn_key", "text",)
    .addColumn("attempts", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("result_message_id", "text",)
    .addColumn("error_code", "text",)
    .addColumn("error_message", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("started_at", "text",)
    .addColumn("finished_at", "text",)
    .addColumn("owner_slug", "text",)
    .execute();

  await database.schema
    .createTable("auth_factors",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("kind", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .addColumn("target", "text",)
    .addColumn("verified_at", "integer",)
    .execute();

  await database.schema
    .createTable("auth_challenges",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("factor_id", "text", (col,) => col.notNull().references("auth_factors.id",).onDelete("cascade",),)
    .addColumn("purpose", "text", (col,) => col.notNull(),)
    .addColumn("nonce_hash", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "integer", (col,) => col.notNull(),)
    .addColumn("attempts", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("consumed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("tooling_reports",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("ts", "text", (col,) => col.defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,).notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("tool", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("attempt", "integer",)
    .addColumn("max_attempts", "integer",)
    .addColumn("detail", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("duration_ms", "integer",)
    .addColumn("profile", "text",)
    .addColumn("branch", "text",)
    .addColumn("git_sha", "text",)
    .addColumn("instance_id", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("dedupe_key", "text",)
    .addColumn("count", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("last_seen", "text",)
    .addCheckConstraint("ck_tooling_reports_source", sql`source IN ('assistant', 'harness', 'giwt', 'check')`,)
    .addCheckConstraint(
      "ck_tooling_reports_category",
      sql`category IN ('tooling_failure', 'retry_exhausted', 'persistent_failure', 'performance')`,
    )
    .addCheckConstraint(
      "ck_tooling_reports_numerics",
      sql`(attempt IS NULL OR attempt >= 0) AND (max_attempts IS NULL OR max_attempts >= 0) AND (duration_ms IS NULL OR duration_ms >= 0)`,
    )
    .addCheckConstraint("ck_tooling_reports_count", sql`count >= 1`,)
    .execute();

  await database.schema
    .createTable("watchdog_events",)
    .addColumn("id", "integer", (col,) => col.primaryKey(),)
    .addColumn("event_kind", "text", (col,) => col.notNull(),)
    .addColumn("decision_kind", "text", (col,) => col.notNull(),)
    .addColumn("at_ms", "integer", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("reason", "text",)
    .addColumn("misses", "integer",)
    .addColumn("crashes", "integer",)
    .addCheckConstraint("ck_watchdog_events_event_kind", sql`event_kind IN ('probe', 'crash')`,)
    .addCheckConstraint("ck_watchdog_events_decision_kind", sql`decision_kind IN ('restart', 'kill', 'stop', 'wait')`,)
    .addCheckConstraint(
      "ck_watchdog_events_numerics",
      sql`(misses IS NULL OR misses >= 0) AND (crashes IS NULL OR crashes >= 0)`,
    )
    .execute();

  // raw index: idx_ap_actor_keys_actor_status
  await sql`CREATE INDEX "idx_ap_actor_keys_actor_status" on "activitypub_actor_keys" ("actor_id", "status")`.execute(
    database,
  );

  // raw index: idx_auth_challenges_expires_at
  await sql`CREATE INDEX idx_auth_challenges_expires_at
    ON auth_challenges (expires_at)
  `.execute(database,);

  // raw index: idx_auth_challenges_lookup
  await sql`CREATE INDEX idx_auth_challenges_lookup
    ON auth_challenges (user_id, factor_id, purpose, consumed)
  `.execute(database,);

  // raw index: idx_auth_factors_user
  await sql`CREATE INDEX idx_auth_factors_user
    ON auth_factors (user_id)
  `.execute(database,);

  // raw index: idx_backup_records_owner
  await sql`CREATE INDEX "idx_backup_records_owner" on "backup_records" ("owner_id", "resource_type")`.execute(
    database,
  );

  // raw index: idx_growth_log_actor_axis_status
  await sql`CREATE INDEX "idx_growth_log_actor_axis_status" on "growth_log" ("actor_id", "axis", "status")`.execute(
    database,
  );

  // raw index: idx_growth_log_actor_recorded
  await sql`CREATE INDEX "idx_growth_log_actor_recorded" on "growth_log" ("actor_id", "recorded_at")`.execute(
    database,
  );

  // raw index: idx_harness_queue_turns_batch
  await sql`CREATE INDEX idx_harness_queue_turns_batch
    ON harness_queue_turns (batch_id)
  `.execute(database,);

  // raw index: idx_harness_queue_turns_profile_status
  await sql`CREATE INDEX idx_harness_queue_turns_profile_status
    ON harness_queue_turns (profile, status)
  `.execute(database,);

  // raw index: idx_harness_queue_turns_status
  await sql`CREATE INDEX idx_harness_queue_turns_status
    ON harness_queue_turns (status, created_at)
  `.execute(database,);

  // raw index: idx_integration_tokens_issuer
  await sql`CREATE INDEX idx_integration_tokens_issuer
    ON integration_tokens (issuer_admin_user_id)
  `.execute(database,);

  // raw index: idx_log_entries_created_at
  await sql`CREATE INDEX idx_log_entries_created_at ON log_entries(created_at)`.execute(database,);
  // raw index: idx_log_entries_entity
  await sql`CREATE INDEX "idx_log_entries_entity" on "log_entries" ("entity_type", "entity_id")`.execute(database,);
  // raw index: idx_log_entries_event_time
  await sql`CREATE INDEX "idx_log_entries_event_time" on "log_entries" ("event_type", "created_at")`.execute(database,);
  // raw index: idx_log_entries_user_time
  await sql`CREATE INDEX "idx_log_entries_user_time" on "log_entries" ("user_id", "created_at")`.execute(database,);
  // raw index: idx_message_reminders_due
  await sql`CREATE INDEX idx_message_reminders_due
      ON message_reminders (remind_at)
    `.execute(database,);

  // raw index: idx_message_reminders_unique
  await sql`CREATE UNIQUE INDEX idx_message_reminders_unique
      ON message_reminders (message_id, user_id)
    `.execute(database,);

  // raw index: idx_notifications_created_at
  await sql`CREATE INDEX "idx_notifications_created_at" on "notifications" ("created_at")`.execute(database,);
  // raw index: idx_notifications_user_read
  await sql`CREATE INDEX "idx_notifications_user_read" on "notifications" ("user_id", "read", "created_at")`.execute(
    database,
  );

  // raw index: idx_plan_items_chat
  await sql`CREATE INDEX idx_plan_items_chat ON plan_items (chat_id)
  `.execute(database,);

  // raw index: idx_plan_items_owner
  await sql`CREATE INDEX idx_plan_items_owner ON plan_items (owner_id, state)
  `.execute(database,);

  // raw index: idx_plan_links_from
  await sql`CREATE INDEX idx_plan_links_from ON plan_links (from_id)
  `.execute(database,);

  // raw index: idx_plan_links_to
  await sql`CREATE INDEX idx_plan_links_to ON plan_links (to_id)
  `.execute(database,);

  // raw index: idx_proactive_messaging_actor
  await sql`CREATE INDEX "idx_proactive_messaging_actor" on "proactive_messaging_config" ("actor_id")`.execute(
    database,
  );

  // raw index: idx_proactive_messaging_chat
  await sql`CREATE INDEX "idx_proactive_messaging_chat" on "proactive_messaging_config" ("chat_id")`.execute(database,);
  // raw index: idx_proactive_messaging_chat_actor
  await sql`CREATE INDEX "idx_proactive_messaging_chat_actor" on "proactive_messaging_config" ("chat_id", "actor_id")`
    .execute(database,);

  // raw index: idx_ranking_snapshots_refresh
  await sql`CREATE INDEX "idx_ranking_snapshots_refresh" on "ranking_snapshots" ("source", "source_key", "next_refresh_after")`
    .execute(database,);

  // raw index: idx_request_results_record_hash
  await sql`CREATE INDEX "idx_request_results_record_hash" on "request_results" ("record_hash")`.execute(database,);
  // raw index: idx_request_results_status_completed
  await sql`CREATE INDEX "idx_request_results_status_completed" on "request_results" ("status", "completed_at")`
    .execute(database,);

  // raw index: idx_request_results_user_started
  await sql`CREATE INDEX "idx_request_results_user_started" on "request_results" ("user_id", "started_at")`.execute(
    database,
  );

  // raw index: idx_scheduled_messages_due
  await sql`CREATE INDEX idx_scheduled_messages_due
      ON scheduled_messages (status, send_at)
    `.execute(database,);

  // raw index: idx_sessions_created_at
  await sql`CREATE INDEX "idx_sessions_created_at" on "sessions" ("created_at")`.execute(database,);
  // raw index: idx_sessions_last_activity
  await sql`CREATE INDEX "idx_sessions_last_activity" on "sessions" ("last_activity")`.execute(database,);
  // raw index: idx_sessions_secret_hash
  await sql`CREATE INDEX "idx_sessions_secret_hash" on "sessions" ("secret_hash")`.execute(database,);
  // raw index: idx_sessions_user_expires
  await sql`CREATE INDEX "idx_sessions_user_expires" on "sessions" ("user_id", "expires_at")`.execute(database,);
  // raw index: idx_sessions_user_id
  await sql`CREATE INDEX "idx_sessions_user_id" on "sessions" ("user_id")`.execute(database,);
  // raw index: idx_synthetic_data_chat
  await sql`CREATE INDEX "idx_synthetic_data_chat" on "synthetic_data" ("chat_id")`.execute(database,);
  // raw index: idx_synthetic_data_status
  await sql`CREATE INDEX "idx_synthetic_data_status" on "synthetic_data" ("status")`.execute(database,);
  // raw index: idx_synthetic_data_type
  await sql`CREATE INDEX "idx_synthetic_data_type" on "synthetic_data" ("type")`.execute(database,);
  // raw index: idx_synthetic_data_world
  await sql`CREATE INDEX "idx_synthetic_data_world" on "synthetic_data" ("world_id")`.execute(database,);
  // raw index: idx_task_dependencies_depends_on
  await sql`CREATE INDEX "idx_task_dependencies_depends_on" on "task_dependencies" ("depends_on_task_id")`.execute(
    database,
  );

  // raw index: idx_telemetry_events_chat_created
  await sql`CREATE INDEX "idx_telemetry_events_chat_created" on "telemetry_events" ("chat_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_telemetry_events_created
  await sql`CREATE INDEX "idx_telemetry_events_created" on "telemetry_events" ("created_at")`.execute(database,);
  // raw index: idx_telemetry_events_created_at
  await sql`CREATE INDEX "idx_telemetry_events_created_at" on "telemetry_events" ("created_at")`.execute(database,);
  // raw index: idx_telemetry_events_type
  await sql`CREATE INDEX "idx_telemetry_events_type" on "telemetry_events" ("event_type")`.execute(database,);
  // raw index: idx_telemetry_events_user_created
  await sql`CREATE INDEX "idx_telemetry_events_user_created" on "telemetry_events" ("user_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_tool_call_audit_chat_created
  await sql`CREATE INDEX "idx_tool_call_audit_chat_created" on "tool_call_audit" ("chat_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_tool_call_audit_tool_created
  await sql`CREATE INDEX "idx_tool_call_audit_tool_created" on "tool_call_audit" ("tool", "created_at")`.execute(
    database,
  );

  // raw index: idx_tooling_reports_instance_ts
  await sql`CREATE INDEX "idx_tooling_reports_instance_ts" on "tooling_reports" ("instance_id", "ts")`.execute(
    database,
  );

  // raw index: idx_user_api_keys_created_at
  await sql`CREATE INDEX "idx_user_api_keys_created_at" on "user_api_keys" ("created_at")`.execute(database,);
  // raw index: idx_user_api_keys_updated_at
  await sql`CREATE INDEX "idx_user_api_keys_updated_at" on "user_api_keys" ("updated_at")`.execute(database,);
  // raw index: idx_users_created_at
  await sql`CREATE INDEX "idx_users_created_at" on "users" ("created_at")`.execute(database,);
  // raw index: idx_users_last_seen_at
  await sql`CREATE INDEX "idx_users_last_seen_at" on "users" ("last_seen_at")`.execute(database,);
  // raw index: idx_users_role
  await sql`CREATE INDEX "idx_users_role" on "users" ("role")`.execute(database,);
  // raw index: idx_watchdog_events_at_ms
  await sql`CREATE INDEX idx_watchdog_events_at_ms
    ON watchdog_events (at_ms DESC)
  `.execute(database,);

  // raw index: uq_ranking_snapshots_version
  await sql`CREATE UNIQUE INDEX "uq_ranking_snapshots_version" on "ranking_snapshots" ("source", "source_key", "version")`
    .execute(database,);

  // raw index: uq_tooling_reports_dedupe_key
  await sql`CREATE UNIQUE INDEX uq_tooling_reports_dedupe_key
    ON tooling_reports (dedupe_key)
    WHERE dedupe_key IS NOT NULL
  `.execute(database,);

  // raw index: uq_user_api_keys_user_provider
  await sql`CREATE UNIQUE INDEX uq_user_api_keys_user_provider
    ON user_api_keys (user_id, provider_name)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("watchdog_events",).execute();
  await database.schema.dropTable("tooling_reports",).execute();
  await database.schema.dropTable("auth_challenges",).execute();
  await database.schema.dropTable("auth_factors",).execute();
  await database.schema.dropTable("harness_queue_turns",).execute();
  await database.schema.dropTable("integration_tokens",).execute();
  await database.schema.dropTable("tool_call_audit",).execute();
  await database.schema.dropTable("ranking_snapshots",).execute();
  await database.schema.dropTable("backup_records",).execute();
  await database.schema.dropTable("plan_links",).execute();
  await database.schema.dropTable("plan_items",).execute();
  await database.schema.dropTable("message_reminders",).execute();
  await database.schema.dropTable("scheduled_messages",).execute();
  await database.schema.dropTable("task_dependencies",).execute();
  await database.schema.dropTable("synthetic_data",).execute();
  await database.schema.dropTable("proactive_messaging_config",).execute();
  await database.schema.dropTable("growth_log",).execute();
  await database.schema.dropTable("activitypub_actor_keys",).execute();
  await database.schema.dropTable("users",).execute();
  await database.schema.dropTable("user_api_keys",).execute();
  await database.schema.dropTable("telemetry_events",).execute();
  await database.schema.dropTable("system_config",).execute();
  await database.schema.dropTable("sessions",).execute();
  await database.schema.dropTable("seed_audit",).execute();
  await database.schema.dropTable("request_results",).execute();
  await database.schema.dropTable("notifications",).execute();
  await database.schema.dropTable("meta_progression",).execute();
  await database.schema.dropTable("log_entries",).execute();
  await database.schema.dropTable("data_migrations",).execute();
}
