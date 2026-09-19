// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character license history (TASK-030 audit trail).
 *
 * Every licensing upsert or removal records a row here so license changes
 * are auditable per character. Deletions record `license_type = 'removed'`
 * with the previous flags.
 *
 * Top-level (not a `001_init` part): `001_init.ts` is frozen. New top-level
 * migrations are auto-discovered by `getMigrationFiles()` (sorted by name).
 */
import { type Kysely, sql, } from "kysely";
import { recordSchemaVersion, removeSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
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

  await recordSchemaVersion(database, 32, "character license history audit trail",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("character_license_history",).execute();
  await removeSchemaVersion(database, 32,);
}
