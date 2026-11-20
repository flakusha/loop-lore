// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 112_asset_user_preferences
 *
 * Per-user gallery download preferences. `download_naming` is NULL by
 * default, which follows the admin `assets.downloadNaming` default (`raw`);
 * a non-NULL value overrides it for that user's single and batch downloads.
 * Modes are validated at the route layer (`raw | datetime | hash |
 * datetime-hash`); the column stays free text so a future mode needs no
 * schema change. One row per user: `user_id` is the primary key.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("asset_user_preferences",)
    .addColumn("user_id", "text", (col,) => col.primaryKey(),)
    .addColumn("download_naming", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("asset_user_preferences",).execute();
}
