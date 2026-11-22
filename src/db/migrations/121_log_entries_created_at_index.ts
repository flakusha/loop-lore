// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 121_log_entries_created_at_index
 *
 * Index log_entries.created_at: the admin audit listing orders by it, and the
 * log retention cron deletes by created_at cutoff. log_entries is the shared
 * audit sink for moderation/nsfw/federation events and grows with every
 * audited action, so both paths were full scans.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await sql`CREATE INDEX idx_log_entries_created_at ON log_entries(created_at)`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_log_entries_created_at`.execute(database,);
}
