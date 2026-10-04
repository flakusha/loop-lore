// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 030_assets_content_hash_unique
 *
 * Backs the asset dedup key with a database constraint so the insert, not a
 * pre-read, arbitrates concurrent identical uploads. Before this migration
 * `assets.content_hash` was a bare nullable column with no index
 * (001_init.ts:424) and the only assets indexes were `idx_assets_created_at`,
 * `idx_assets_owner`, `idx_assets_record_hash` (001_init.ts:469-485), so two
 * concurrent `createAsset` calls with the same owner and bytes both read
 * `existing === null` and both inserted.
 *
 * Key: `(owner_id, content_hash, encryption_tier, encrypted_key_id)` — the
 * final key required by BUG-asset-dedup-ignores-requested-encryption-tier-and-key-return
 * and BUG-asset-dedup-collapses-all-users-edits-onto-one-system-owned-, so
 * widening it later costs no second migration.
 *
 * WHY TWO INDEXES, NOT ONE
 * `encrypted_key_id` is nullable and is NULL for every public-tier asset
 * (the gallery upload path, src/assets/controller.ts:515). SQLite treats NULLs
 * as distinct in a unique index, so a single four-column index would let two
 * public-tier rows with identical (owner, content) both land — the exact
 * idempotency break this migration exists to close. Splitting on the nullable
 * column, exactly as 020_actor_story_points_partial_unique did, enforces both
 * halves:
 *   - keyed rows   (encrypted_key_id NOT NULL) → keyed index
 *   - public rows  (encrypted_key_id IS NULL) → public index
 *
 * `content_hash` is NULL for callers that pass `dedupe: false`, so it is
 * excluded from the partial predicate and those rows never collide — that
 * opt-out is load-bearing, not an edge case (persist-generated.ts:62 relies
 * on it).
 *
 * Both indexes are valid Postgres partial unique indexes, so the planned
 * SQLite → PG dialect swap needs no rewrite.
 *
 * Append-only policy (src/db/migrations/README.md): a forward schema change,
 * not a rewrite of 001_init.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // Defensive dedupe, as in 020: a database that has run the old check-then-act
  // path may already hold byte-identical rows per owner (the ticket recorded 8
  // rows from 8 concurrent calls). CREATE UNIQUE INDEX aborts on existing
  // duplicates, which would leave the migration stuck half-applied on any live
  // database. Collapse each group to its oldest row and warn, then build.
  const dupes = await sql<
    {
      owner_id: string;
      content_hash: string;
      encryption_tier: string;
      encrypted_key_id: string | null;
      n: number;
    }
  >`
      SELECT owner_id, content_hash, encryption_tier, encrypted_key_id, COUNT(*) AS n
      FROM assets
      WHERE content_hash IS NOT NULL
      GROUP BY owner_id, content_hash, encryption_tier, encrypted_key_id
      HAVING COUNT(*) > 1
    `.execute(database,);

  for (const dupe of dupes.rows) {
    process.emitWarning(
      `[030_assets_content_hash_unique] owner ${dupe.owner_id} has ${dupe.n} rows with identical content at tier ${dupe.encryption_tier}; collapsing to the oldest.`,
    );

    // Keep the oldest row: it owns the storage_path and asset_links that any
    // surviving reference already points at. Newer duplicates are orphans.
    await sql`
      DELETE FROM assets
      WHERE content_hash IS NOT NULL
        AND owner_id = ${dupe.owner_id}
        AND content_hash = ${dupe.content_hash}
        AND encryption_tier = ${dupe.encryption_tier}
        AND encrypted_key_id IS ${dupe.encrypted_key_id}
        AND id NOT IN (
          SELECT id FROM assets
          WHERE content_hash IS NOT NULL
            AND owner_id = ${dupe.owner_id}
            AND content_hash = ${dupe.content_hash}
            AND encryption_tier = ${dupe.encryption_tier}
            AND encrypted_key_id IS ${dupe.encrypted_key_id}
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        )
    `.execute(database,);
  }

  await sql`
    CREATE UNIQUE INDEX uq_assets_owner_content_keyed
    ON assets (owner_id, content_hash, encryption_tier, encrypted_key_id)
    WHERE content_hash IS NOT NULL AND encrypted_key_id IS NOT NULL
  `.execute(database,);

  await sql`
    CREATE UNIQUE INDEX uq_assets_owner_content_public
    ON assets (owner_id, content_hash, encryption_tier)
    WHERE content_hash IS NOT NULL AND encrypted_key_id IS NULL
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .dropIndex("uq_assets_owner_content_keyed",)
    .execute();

  await database.schema
    .dropIndex("uq_assets_owner_content_public",)
    .execute();
}
