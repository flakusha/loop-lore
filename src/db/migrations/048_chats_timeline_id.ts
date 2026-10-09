// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 048_chats_timeline_id
 *
 * Add nullable `timeline_id` to chats so the impersonation conflict scope
 * can narrow to (world_id, current_location_id, timeline_id). Plain text,
 * no FK: matches the `world_timeline_events.timeline_id` / steering
 * convention (timeline slug, default 'prime' elsewhere). NULL = unset —
 * the helper falls back to the pre-existing (world, location) scope.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("timeline_id", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("chats",).dropColumn("timeline_id",).execute();
}
