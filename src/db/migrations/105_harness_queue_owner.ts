// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 105_harness_queue_owner
 *
 * Multi-instance harness queue: tag a running turn with the instance that
 * claimed it, so boot recovery can fail only this instance's orphaned rows
 * instead of killing another instance's in-flight work. The column is
 * nullable: rows claimed before this migration have no owner and are left
 * alone by recovery (there is no evidence which process owned them).
 *
 * The (profile, status) index serves the claim's DB-side "no other running
 * turn for this profile" exclusion — that check must be a single statement
 * with the claim, because a process-local Map cannot serialize two instances
 * sharing one database.
 *
 * Append-only: 104 is an uncommitted sibling migration, so keep 105.
 */
import { type Kysely, sql, } from "kysely";

/**
 * Add the nullable owner column and the per-profile in-flight lookup index.
 * @param database - migration database handle
 * @returns resolves when both exist
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("harness_queue_turns",)
    .addColumn("owner_slug", "text", (col,) => col,)
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_harness_queue_turns_profile_status
    ON harness_queue_turns (profile, status)
  `.execute(database,);
}

/**
 * Remove the index and column added by {@link up}.
 * @param database - migration database handle
 * @returns resolves when both are gone
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_harness_queue_turns_profile_status`.execute(database,);
  await database.schema
    .alterTable("harness_queue_turns",)
    .dropColumn("owner_slug",)
    .execute();
}
