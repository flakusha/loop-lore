/**
 * NSFW Moderation — DB Schema
 *
 * Adds nsfw_user_preferences, content_flags, and moderation_actions tables.
 * Enables per-user NSFW toggles, user-submitted content flags, and
 * immutable audit trail for moderation actions.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  // ── NSFW User Preferences ──────────────────────────────
  await db.schema
    .createTable("nsfw_user_preferences",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("nsfw_enabled", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_rating", "text", (col,) => col.notNull().defaultTo("nsfw_mild",),)
    .addColumn("blocked_from_nsfw", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("banned_from_nsfw", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("shadow_nsfw", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("block_reason", "text",)
    .addColumn("banned_at", "text",)
    .addColumn("banned_by", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await db.schema
    .createIndex("nsfw_prefs_user_idx",)
    .on("nsfw_user_preferences",)
    .column("user_id",)
    .unique()
    .execute();

  // ── Content Flags ───────────────────────────────────────
  await db.schema
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

  await db.schema
    .createIndex("content_flags_status_idx",)
    .on("content_flags",)
    .column("status",)
    .execute();

  await db.schema
    .createIndex("content_flags_reporter_idx",)
    .on("content_flags",)
    .column("reporter_id",)
    .execute();

  // ── Moderation Actions ──────────────────────────────────
  await db.schema
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
    .execute();

  await db.schema
    .createIndex("mod_actions_target_idx",)
    .on("moderation_actions",)
    .column("target_user_id",)
    .execute();

  await db.schema
    .createIndex("mod_actions_type_idx",)
    .on("moderation_actions",)
    .column("action_type",)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("moderation_actions",).execute();
  await db.schema.dropTable("content_flags",).execute();
  await db.schema.dropTable("nsfw_user_preferences",).execute();
}
