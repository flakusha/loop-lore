// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Moderation — final-form schema (Moderation + NSFW).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
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
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("nsfw_user_preferences",).execute();
  await database.schema.dropTable("nsfw_encounters",).execute();
  await database.schema.dropTable("nsfw_consent_state",).execute();
  await database.schema.dropTable("moderation_appeals",).execute();
  await database.schema.dropTable("location_nsfw_config",).execute();
  await database.schema.dropTable("content_flags",).execute();
  await database.schema.dropTable("moderation_actions",).execute();
}
