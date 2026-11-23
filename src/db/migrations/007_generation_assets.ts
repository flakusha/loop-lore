// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 007_generation_assets — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("model_capabilities",)
    .addColumn("id", "text", (col,) => col.notNull().primaryKey(),)
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
    .addColumn("user_override", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("notes", "text",)
    .addColumn("last_seen", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("native_locale", "text",)
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
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("temperature", "real",)
    .addColumn("max_tokens", "integer",)
    .execute();

  await database.schema
    .createTable("asset_links",)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("entity_type", "text", (col,) => col.notNull(),)
    .addColumn("entity_id", "text", (col,) => col.notNull(),)
    .addColumn("label", "text",)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("archived_at", "text",)
    .addPrimaryKeyConstraint("pk_asset_links", ["asset_id", "entity_type", "entity_id",],)
    .execute();

  await database.schema
    .createTable("asset_shares",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("shared_with_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("shared_by_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
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
    .addColumn("storage_backend", "text", (col,) => col.defaultTo("local",).notNull(),)
    .addColumn("width", "integer",)
    .addColumn("height", "integer",)
    .addColumn("duration_secs", "real",)
    .addColumn("alt_text", "text",)
    .addColumn("visibility", "text", (col,) => col.defaultTo("private",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("encryption_tier", "text", (col,) => col.defaultTo("public",).notNull(),)
    .addColumn("encrypted_key_id", "text",)
    .addColumn("alpha_status", "text", (col,) => col.defaultTo("unknown",).notNull(),)
    .addColumn("content_hash", "text",)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("thumbnail_path", "text",)
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
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addPrimaryKeyConstraint("pk_asset_transforms", ["asset_id", "context",],)
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
    .addColumn("is_playlist", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("track_count", "integer",)
    .addColumn("explicit", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("year", "integer",)
    .addColumn("genre", "text",)
    .addColumn("nsfw_hidden", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("generation_attempts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("parent_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("idempotency_key", "text", (col,) => col.notNull(),)
    .addColumn("model_id", "text", (col,) => col.notNull(),)
    .addColumn("provider", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("pending",).notNull(),)
    .addColumn("cancel_reason", "text",)
    .addColumn("cancel_reason_detail", "text",)
    .addColumn("cancel_source", "text",)
    .addColumn("abort_signal_id", "text",)
    .addColumn("started_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
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
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_rendered_chunk_index", "integer",)
    .addColumn("delivery_confirmed_at", "text",)
    .addColumn("side_effect_jobs_cancelled", "integer", (col,) => col.defaultTo(0,),)
    .execute();

  await database.schema
    .createTable("generation_jobs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("kind", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("status", "text", (col,) => col.defaultTo("pending",).notNull(),)
    .addColumn("payload", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("results", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("error_message", "text",)
    .addColumn("started_at", "text",)
    .addColumn("completed_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("prompt_templates",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("modality", "text", (col,) => col.defaultTo("llm",).notNull(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("model_family", "text",)
    .addColumn("detail_level", "text", (col,) => col.defaultTo("balanced",).notNull(),)
    .addColumn("payload", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("is_default", "text", (col,) => col.defaultTo("not_default",).notNull(),)
    .addColumn("enabled", "text", (col,) => col.defaultTo("enabled",).notNull(),)
    .addColumn("lora_slots", "text",)
    .addColumn("min_vram", "integer",)
    .addColumn("probe_status", "text", (col,) => col.defaultTo("unprobed",).notNull(),)
    .addColumn("params_reviewed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("license", "text",)
    .addCheckConstraint(
      "ck_prompt_templates_modality",
      sql`modality IN ('llm', 'image', 'video', 'audio', 'workflow')`,
    )
    .execute();

  await database.schema
    .createTable("workflow_sessions",)
    .addColumn("chat_id", "text", (col,) => col.primaryKey().references("chats.id",).onDelete("cascade",),)
    .addColumn("workflow_id", "text", (col,) => col.notNull(),)
    .addColumn("step_values", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("confirmed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("asset_tags",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("tag", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.defaultTo("user",).notNull(),)
    .addColumn("owner_id", "text",)
    .addColumn("source", "text", (col,) => col.defaultTo("manual",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("asset_tag_dismissals",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",),)
    .addColumn("tag", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("model_comparison_runs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("prompt", "text", (col,) => col.notNull(),)
    .addColumn("results", "text", (col,) => col.notNull(),)
    .addColumn("ratings", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("link_previews",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("url_hash", "text", (col,) => col.notNull().unique(),)
    .addColumn("url", "text", (col,) => col.notNull(),)
    .addColumn("title", "text",)
    .addColumn("description", "text",)
    .addColumn("image_url", "text",)
    .addColumn("fetched_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("model_rankings",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("scope_key", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("subject_key", "text", (col,) => col.notNull(),)
    .addColumn("metric", "text", (col,) => col.notNull(),)
    .addColumn("value", "real", (col,) => col.notNull(),)
    .addColumn("unit", "text",)
    .addColumn("basis", "text", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_version", "text",)
    .addColumn("source_ref", "text",)
    .addColumn("observed_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("meta", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("asset_user_preferences",)
    .addColumn("user_id", "text", (col,) => col.primaryKey(),)
    .addColumn("download_naming", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .execute();

  // raw index: idx_asset_links_chat_archived
  await sql`CREATE INDEX "idx_asset_links_chat_archived" on "asset_links" ("entity_type", "entity_id", "archived_at")`
    .execute(database,);

  // raw index: idx_asset_links_entity
  await sql`CREATE INDEX "idx_asset_links_entity" on "asset_links" ("entity_type", "entity_id")`.execute(database,);
  // raw index: idx_asset_shares_asset
  await sql`CREATE INDEX "idx_asset_shares_asset" on "asset_shares" ("asset_id")`.execute(database,);
  // raw index: idx_asset_shares_asset_with
  await sql`CREATE INDEX "idx_asset_shares_asset_with" on "asset_shares" ("asset_id", "shared_with_id")`.execute(
    database,
  );

  // raw index: idx_asset_shares_shared_by_created
  await sql`CREATE INDEX "idx_asset_shares_shared_by_created" on "asset_shares" ("shared_by_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_asset_shares_with
  await sql`CREATE INDEX "idx_asset_shares_with" on "asset_shares" ("shared_with_id")`.execute(database,);
  // raw index: idx_asset_tag_dismissals_asset_user
  await sql`CREATE INDEX "idx_asset_tag_dismissals_asset_user" on "asset_tag_dismissals" ("asset_id", "user_id")`
    .execute(database,);

  // raw index: idx_asset_tag_dismissals_unique
  await sql`CREATE UNIQUE INDEX "idx_asset_tag_dismissals_unique" on "asset_tag_dismissals" ("asset_id", "tag", "user_id")`
    .execute(database,);

  // raw index: idx_asset_tags_asset
  await sql`CREATE INDEX "idx_asset_tags_asset" on "asset_tags" ("asset_id")`.execute(database,);
  // raw index: idx_asset_tags_global_unique
  await sql`CREATE UNIQUE INDEX "idx_asset_tags_global_unique" on "asset_tags" ("asset_id", "tag") where scope = 'global'`
    .execute(database,);

  // raw index: idx_asset_tags_user_unique
  await sql`CREATE UNIQUE INDEX "idx_asset_tags_user_unique" on "asset_tags" ("asset_id", "tag", "owner_id") where scope = 'user'`
    .execute(database,);

  // raw index: idx_asset_transforms_asset
  await sql`CREATE INDEX "idx_asset_transforms_asset" on "asset_transforms" ("asset_id")`.execute(database,);
  // raw index: idx_assets_created_at
  await sql`CREATE INDEX "idx_assets_created_at" on "assets" ("created_at")`.execute(database,);
  // raw index: idx_assets_owner
  await sql`CREATE INDEX "idx_assets_owner" on "assets" ("owner_id")`.execute(database,);
  // raw index: idx_assets_record_hash
  await sql`CREATE INDEX "idx_assets_record_hash" on "assets" ("record_hash")`.execute(database,);
  // raw index: idx_generation_attempts_abort_signal
  await sql`CREATE INDEX "idx_generation_attempts_abort_signal" on "generation_attempts" ("abort_signal_id")`.execute(
    database,
  );

  // raw index: idx_generation_attempts_actor
  await sql`CREATE INDEX "idx_generation_attempts_actor" on "generation_attempts" ("actor_id")`.execute(database,);
  // raw index: idx_generation_attempts_chat
  await sql`CREATE INDEX "idx_generation_attempts_chat" on "generation_attempts" ("chat_id")`.execute(database,);
  // raw index: idx_generation_attempts_created_at
  await sql`CREATE INDEX "idx_generation_attempts_created_at" on "generation_attempts" ("created_at")`.execute(
    database,
  );

  // raw index: idx_generation_attempts_idempotency
  await sql`CREATE INDEX "idx_generation_attempts_idempotency" on "generation_attempts" ("idempotency_key")`.execute(
    database,
  );

  // raw index: idx_generation_attempts_parent
  await sql`CREATE INDEX "idx_generation_attempts_parent" on "generation_attempts" ("parent_attempt_id")`.execute(
    database,
  );

  // raw index: idx_generation_attempts_parent_msg
  await sql`CREATE INDEX "idx_generation_attempts_parent_msg" on "generation_attempts" ("parent_message_id")`.execute(
    database,
  );

  // raw index: idx_generation_attempts_status
  await sql`CREATE INDEX "idx_generation_attempts_status" on "generation_attempts" ("status")`.execute(database,);
  // raw index: idx_generation_jobs_actor
  await sql`CREATE INDEX "idx_generation_jobs_actor" on "generation_jobs" ("actor_id")`.execute(database,);
  // raw index: idx_generation_jobs_status
  await sql`CREATE INDEX "idx_generation_jobs_status" on "generation_jobs" ("status")`.execute(database,);
  // raw index: idx_model_capabilities_last_seen
  await sql`CREATE INDEX "idx_model_capabilities_last_seen" on "model_capabilities" ("last_seen")`.execute(database,);
  // raw index: idx_model_capabilities_provider
  await sql`CREATE INDEX "idx_model_capabilities_provider" on "model_capabilities" ("provider_id")`.execute(database,);
  // raw index: idx_model_rankings_expires
  await sql`CREATE INDEX "idx_model_rankings_expires" on "model_rankings" ("expires_at")`.execute(database,);
  // raw index: idx_model_rankings_latest
  await sql`CREATE INDEX "idx_model_rankings_latest" on "model_rankings" ("scope", "scope_key", "subject_key", "metric", "observed_at")`
    .execute(database,);

  // raw index: idx_prompt_templates_modality
  await sql`CREATE INDEX "idx_prompt_templates_modality" on "prompt_templates" ("modality")`.execute(database,);
  // raw index: idx_prompt_templates_owner
  await sql`CREATE INDEX "idx_prompt_templates_owner" on "prompt_templates" ("owner_id")`.execute(database,);
  // raw index: model_comparison_runs_user_created
  await sql`CREATE INDEX "model_comparison_runs_user_created" on "model_comparison_runs" ("user_id", "created_at")`
    .execute(database,);

  // raw index: music_links_chat_created_idx
  await sql`CREATE INDEX "music_links_chat_created_idx" on "music_links" ("chat_id", "created_at")`.execute(database,);
  // raw index: music_links_sender_idx
  await sql`CREATE INDEX "music_links_sender_idx" on "music_links" ("sender_id")`.execute(database,);
  // raw index: uq_assets_owner_content_keyed
  await sql`CREATE UNIQUE INDEX uq_assets_owner_content_keyed
    ON assets (owner_id, content_hash, encryption_tier, encrypted_key_id)
    WHERE content_hash IS NOT NULL AND encrypted_key_id IS NOT NULL
  `.execute(database,);

  // raw index: uq_assets_owner_content_public
  await sql`CREATE UNIQUE INDEX uq_assets_owner_content_public
    ON assets (owner_id, content_hash, encryption_tier)
    WHERE content_hash IS NOT NULL AND encrypted_key_id IS NULL
  `.execute(database,);

  // raw index: uq_model_rankings_ingest
  await sql`CREATE UNIQUE INDEX "uq_model_rankings_ingest" on "model_rankings" ("scope", "scope_key", "subject_key", "metric", "source", "observed_at")`
    .execute(database,);

  // raw index: uq_prompt_templates_default_family
  await sql`CREATE UNIQUE INDEX uq_prompt_templates_default_family
    ON prompt_templates (model_family, modality)
    WHERE is_default = 'default' AND model_family IS NOT NULL
  `.execute(database,);

  // raw index: uq_prompt_templates_default_global
  await sql`CREATE UNIQUE INDEX uq_prompt_templates_default_global
    ON prompt_templates (modality)
    WHERE is_default = 'default' AND model_family IS NULL
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("asset_user_preferences",).execute();
  await database.schema.dropTable("model_rankings",).execute();
  await database.schema.dropTable("link_previews",).execute();
  await database.schema.dropTable("model_comparison_runs",).execute();
  await database.schema.dropTable("asset_tag_dismissals",).execute();
  await database.schema.dropTable("asset_tags",).execute();
  await database.schema.dropTable("workflow_sessions",).execute();
  await database.schema.dropTable("prompt_templates",).execute();
  await database.schema.dropTable("generation_jobs",).execute();
  await database.schema.dropTable("generation_attempts",).execute();
  await database.schema.dropTable("music_links",).execute();
  await database.schema.dropTable("asset_transforms",).execute();
  await database.schema.dropTable("assets",).execute();
  await database.schema.dropTable("asset_shares",).execute();
  await database.schema.dropTable("asset_links",).execute();
  await database.schema.dropTable("model_role_overrides",).execute();
  await database.schema.dropTable("model_comparisons",).execute();
  await database.schema.dropTable("model_capabilities",).execute();
}
