// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 012_agency_play_counters_unique
 *
 * Adds a UNIQUE index on `agency_play_counters(chat_id, dimension,
 * hour_bucket)` so the upsert path in `quality-metrics.ts` can use
 * SQLite's `ON CONFLICT DO UPDATE` for atomic counters.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createIndex("uq_agency_play_counters_chat_dim_hour",)
    .on("agency_play_counters",)
    .columns(["chat_id", "dimension", "hour_bucket"],)
    .unique()
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("uq_agency_play_counters_chat_dim_hour",).execute();
}
