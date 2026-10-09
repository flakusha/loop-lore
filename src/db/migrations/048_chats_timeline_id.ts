// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 048_chats_timeline_id
 *
 * Add `timeline_id` to chats so the impersonation conflict scope can narrow
 * to (world_id, current_location_id, timeline_id). Plain text, no FK: matches
 * the `world_timeline_events.timeline_id` / steering convention (timeline
 * slug, default 'prime' elsewhere).
 *
 * NOT NULL DEFAULT 'prime' — deliberately not nullable. A NULL `timeline_id`
 * is invisible to the scoped conflict query (SQLite `=` never matches NULL),
 * which let two users hold impersonations of the same actor in the same
 * world+location when one chat was timeline-less and the other on 'prime'.
 * The column default closes both halves at once: SQLite backfills every
 * existing row to 'prime' on ADD COLUMN, and applies 'prime' to every future
 * insert that omits the column, so a chat created after this migration cannot
 * reopen the hole. The NOT NULL constraint additionally rejects an explicit
 * NULL, so no caller can reintroduce it by passing `timeline_id: null`.
 *
 * `down()` drops the column, restoring the exact pre-048 shape (no column at
 * all) for every row — the backfill is fully reverted.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("timeline_id", "text", (col,) => col.notNull().defaultTo("prime",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("chats",).dropColumn("timeline_id",).execute();
}
