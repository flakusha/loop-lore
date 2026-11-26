// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 013_moderation_nsfw — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
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
    .addColumn("status", "text", (col,) => col.defaultTo("pending",).notNull(),)
    .addColumn("resolution", "text",)
    .addColumn("resolved_by", "text",)
    .addColumn("resolved_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
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
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
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
    .addColumn("status", "text", (col,) => col.defaultTo("pending",).notNull(),)
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
    .addColumn("scope", "text", (col,) => col.defaultTo("nsfw_encounter",).notNull(),)
    .addColumn("reason", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("revoked_at", "text",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .createTable("nsfw_encounters",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("encounter_type", "text", (col,) => col.notNull(),)
    .addColumn("intensity", "text", (col,) => col.defaultTo("vanilla",).notNull(),)
    .addColumn("narrative_style", "text", (col,) => col.defaultTo("fade_to_black",).notNull(),)
    .addColumn("participants", "text", (col,) => col.notNull(),)
    .addColumn("phases", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("current_phase", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("outcomes", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("content_tags", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("nsfw_user_preferences",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("nsfw_enabled", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("max_rating", "text", (col,) => col.defaultTo("nsfw_mild",).notNull(),)
    .addColumn("access_status", "text", (col,) => col.defaultTo("clear",).notNull(),)
    .addColumn("shadow_nsfw", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("block_reason", "text",)
    .addColumn("banned_at", "text",)
    .addColumn("banned_by", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .addColumn("nsfw_blur_media", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .execute();

  // raw index: content_flags_open_unique
  await sql`CREATE UNIQUE INDEX content_flags_open_unique
      ON content_flags (content_type, content_id)
      WHERE status IN ('pending', 'under_review')
    `.execute(database,);

  // raw index: content_flags_reporter_idx
  await sql`CREATE INDEX "content_flags_reporter_idx" on "content_flags" ("reporter_id")`.execute(database,);
  // raw index: content_flags_status_idx
  await sql`CREATE INDEX "content_flags_status_idx" on "content_flags" ("status")`.execute(database,);
  // raw index: idx_content_flags_content
  await sql`CREATE INDEX "idx_content_flags_content" on "content_flags" ("content_type", "content_id")`.execute(
    database,
  );

  // raw index: idx_content_flags_created_at
  await sql`CREATE INDEX "idx_content_flags_created_at" on "content_flags" ("created_at")`.execute(database,);
  // raw index: idx_moderation_actions_created_at
  await sql`CREATE INDEX "idx_moderation_actions_created_at" on "moderation_actions" ("created_at")`.execute(database,);
  // raw index: idx_nsfw_consent_state_chat
  await sql`CREATE INDEX "idx_nsfw_consent_state_chat" on "nsfw_consent_state" ("chat_id")`.execute(database,);
  // raw index: idx_nsfw_consent_state_user
  await sql`CREATE INDEX "idx_nsfw_consent_state_user" on "nsfw_consent_state" ("user_id")`.execute(database,);
  // raw index: idx_nsfw_consent_state_user_chat_created
  await sql`CREATE INDEX "idx_nsfw_consent_state_user_chat_created" on "nsfw_consent_state" ("user_id", "chat_id", "created_at")`
    .execute(database,);

  // raw index: idx_nsfw_encounters_world
  await sql`CREATE INDEX "idx_nsfw_encounters_world" on "nsfw_encounters" ("world_id")`.execute(database,);
  // raw index: mod_actions_deleted_at_idx
  await sql`CREATE INDEX "mod_actions_deleted_at_idx" on "moderation_actions" ("deleted_at")`.execute(database,);
  // raw index: mod_actions_superseded_idx
  await sql`CREATE INDEX "mod_actions_superseded_idx" on "moderation_actions" ("superseded_by")`.execute(database,);
  // raw index: mod_actions_target_idx
  await sql`CREATE INDEX "mod_actions_target_idx" on "moderation_actions" ("target_user_id")`.execute(database,);
  // raw index: mod_actions_type_idx
  await sql`CREATE INDEX "mod_actions_type_idx" on "moderation_actions" ("action_type")`.execute(database,);
  // raw index: nsfw_prefs_user_idx
  await sql`CREATE UNIQUE INDEX "nsfw_prefs_user_idx" on "nsfw_user_preferences" ("user_id")`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("nsfw_user_preferences",).execute();
  await database.schema.dropTable("nsfw_encounters",).execute();
  await database.schema.dropTable("nsfw_consent_state",).execute();
  await database.schema.dropTable("moderation_appeals",).execute();
  await database.schema.dropTable("moderation_actions",).execute();
  await database.schema.dropTable("content_flags",).execute();
}
