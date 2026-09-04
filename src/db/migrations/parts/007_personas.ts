// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Personas — final-form schema (Personas).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
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
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("personas",).execute();
}
