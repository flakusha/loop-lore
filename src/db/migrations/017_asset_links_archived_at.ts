// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 017_asset_links_archived_at
 *
 * Soft-link / unlink asset_links to chat archive state. When a chat is
 * archived we stamp the linked asset_links rows with the archive timestamp;
 * unarchive clears the stamp. Hard purge (hardDeleteChat → deleteChat)
 * cascades through the FK chain in 001_init and remains authoritative for
 * removal — this column is purely a soft-state signal so views can hide
 * archived assets without losing the row.
 *
 * One ADD COLUMN per alterTable statement (SQLite limitation).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("asset_links",)
    .addColumn("archived_at", "text",)
    .execute();

  await database.schema
    .createIndex("idx_asset_links_chat_archived",)
    .on("asset_links",)
    .columns(["entity_type", "entity_id", "archived_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_asset_links_chat_archived",).execute();
  await database.schema.alterTable("asset_links",).dropColumn("archived_at",).execute();
}
