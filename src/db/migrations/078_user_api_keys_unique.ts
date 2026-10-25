// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 078_user_api_keys_unique
 *
 * `idx_user_api_keys_user_provider` (001_init) is a plain non-unique index on
 * `user_api_keys (user_id, provider_name)`, so the route's read-then-write
 * upsert has a TOCTOU window: two concurrent POSTs for the same provider both
 * pass the lookup and both insert, and `executeTakeFirst` then reads an
 * arbitrary one of the duplicates
 * (BUG-user-api-keys-non-unique-index-read-then-write-upsert-allows).
 *
 * Adds `uq_user_api_keys_user_provider` (UNIQUE on the same columns) and drops
 * the now-redundant plain index — the unique index serves the same lookups.
 * Unlike 045 there are no exempt key families: one row per (user, provider)
 * is the contract.
 *
 * The route upsert is switched to an atomic ON CONFLICT DO UPDATE in the same
 * change, so a raced pair of POSTs becomes one insert + one update instead of
 * one insert + one constraint failure.
 */
import { type Kysely, sql, } from "kysely";

interface DupRow {
  user_id: string;
  provider_name: string;
  n: number;
}

interface RowId {
  id: string;
}

export async function up(database: Kysely<unknown>,): Promise<void> {
  // Defensive dedupe: collapse pre-existing duplicate groups before the
  // UNIQUE index is built — otherwise index creation fails and the migration
  // chain is stuck. The NEWEST row survives (updated_at DESC, rowid DESC):
  // for stored API keys the last save is the one the user meant.
  const dups = await sql<DupRow>`
    SELECT user_id, provider_name, COUNT(*) AS n
    FROM user_api_keys
    GROUP BY user_id, provider_name
    HAVING COUNT(*) > 1
  `.execute(database,);

  for (const dup of dups.rows) {
    process.emitWarning(
      `[078_user_api_keys_unique] user ${dup.user_id} has ${dup.n} rows for provider ${dup.provider_name}; collapsing to newest.`,
    );

    const survivor = await sql<RowId>`
      SELECT id FROM user_api_keys
      WHERE user_id = ${dup.user_id} AND provider_name = ${dup.provider_name}
      ORDER BY updated_at DESC, rowid DESC
      LIMIT 1
    `.execute(database,);

    const survivorId = survivor.rows[0]?.id;
    if (!survivorId) { continue; }

    await sql`
      DELETE FROM user_api_keys
      WHERE user_id = ${dup.user_id} AND provider_name = ${dup.provider_name} AND id != ${survivorId}
    `.execute(database,);
  }

  await sql`
    CREATE UNIQUE INDEX uq_user_api_keys_user_provider
    ON user_api_keys (user_id, provider_name)
  `.execute(database,);

  await sql`
    DROP INDEX IF EXISTS idx_user_api_keys_user_provider
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_provider
    ON user_api_keys (user_id, provider_name)
  `.execute(database,);

  await sql`
    DROP INDEX IF EXISTS uq_user_api_keys_user_provider
  `.execute(database,);
}
