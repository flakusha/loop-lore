// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actors — final-form schema (Actors + keys + overrides).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
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
    .addForeignKeyConstraint("fk_ap_actor_keys_actor", ["actor_id",], "actors", ["id",],)
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
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("admin_character_overrides",).execute();
  await database.schema.dropTable("actor_notes",).execute();
  await database.schema.dropTable("actor_lore_entries",).execute();
  await database.schema.dropTable("actor_keys",).execute();
  await database.schema.dropTable("actor_items",).execute();
  await database.schema.dropTable("actor_e2e_pubkeys",).execute();
  await database.schema.dropTable("actor_currencies",).execute();
  await database.schema.dropTable("activitypub_actor_keys",).execute();
  await database.schema.dropTable("actors",).execute();
}
