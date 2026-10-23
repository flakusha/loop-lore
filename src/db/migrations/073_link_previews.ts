// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 073_link_previews (TASK-link-previews-unfurl)
 *
 * Cache for OpenGraph unfurls of generic (non-music) links shared in chat.
 * `url_hash` (sha-256 hex of the normalized URL) is the lookup key so the
 * cache never stores duplicate rows for URL variants that differ only in
 * fragments. Freshness is enforced at read time (7-day TTL against
 * `fetched_at`), not by a sweeper.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("link_previews",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("url_hash", "text", (col,) => col.notNull().unique(),)
    .addColumn("url", "text", (col,) => col.notNull(),)
    .addColumn("title", "text",)
    .addColumn("description", "text",)
    .addColumn("image_url", "text",)
    .addColumn("fetched_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("link_previews",).execute();
}
