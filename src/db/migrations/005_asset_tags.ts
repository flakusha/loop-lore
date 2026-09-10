// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset tags + tag-proposition dismissals (gallery tagging G7).
 *
 * `asset_tags` holds tags on an asset in one of two scopes:
 *   - `user`   — a viewer's personal tag set (unique per asset+tag+owner)
 *   - `global` — the asset's shared tag set (unique per asset+tag)
 * Scope uniqueness is enforced with partial unique indexes because SQLite
 * treats NULLs as distinct in a plain unique index (owner_id is NULL for
 * global rows). `source` reserves a `rag` pathway for later metadata-driven
 * proposals without a schema change.
 *
 * `asset_tag_dismissals` records a per-user dismissal of a proposed tag so
 * the proposition feed never re-suggests the same tag for that asset+user.
 *
 * Top-level (not a `001_init` part): `001_init.ts` is frozen. New top-level
 * migrations are auto-discovered by `getMigrationFiles()` (sorted by name).
 */
import { type Kysely, sql, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
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

  await recordSchemaVersion(database, 26, "asset tags and propositions",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("asset_tag_dismissals",).execute();
  await database.schema.dropTable("asset_tags",).execute();
}
