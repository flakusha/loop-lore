// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 055: idempotency key for the XP ledger.
 *
 * The LevelService dedupes grants on (actor_id, source, reference_id), but
 * the pre-check raced: two concurrent awards (Promise.all re-entry, dual
 * completion paths) both observed an empty ledger and double-paid. A UNIQUE
 * index makes the database the arbiter — the losing transaction rolls back
 * and downgrades to a replay. NULL reference_id rows (grants without a
 * reference) stay exempt: SQLite treats NULLs as distinct in unique
 * indexes.
 */
import { type Kysely, } from "kysely";

/**
 * @param db
 * @returns {Promise<void>}
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createIndex("xp_ledger_actor_source_reference_unique",)
    .on("xp_ledger",)
    .columns(["actor_id", "source", "reference_id",],)
    .unique()
    .execute();
}

/**
 * @param db
 * @returns {Promise<void>}
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .dropIndex("xp_ledger_actor_source_reference_unique",)
    .execute();
}
