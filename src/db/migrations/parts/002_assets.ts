// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Assets — final-form schema (Asset storage).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
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
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
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
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("asset_shares",).execute();
  await database.schema.dropTable("asset_links",).execute();
  await database.schema.dropTable("assets",).execute();
}
