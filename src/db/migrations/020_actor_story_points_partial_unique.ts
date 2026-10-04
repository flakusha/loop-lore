// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 020_actor_story_points_partial_unique
 *
 * The `uq_actor_story_points_actor_world` unique index added by
 * migration 019 is a plain `(actor_id, world_id)` index — in SQLite,
 * NULL values are not collapsed by unique constraints, so two rows
 * with the same `actor_id` and `world_id = NULL` are BOTH allowed
 * (R2 from the agency-story-points review). The docstring on 019
 * promises a single global row per actor; this migration enforces it.
 *
 * Strategy:
 *   1. Defensive dedupe — for any actor with multiple NULL-world rows,
 *      collapse to one (oldest row absorbs the balance and counters;
 *      duplicates are removed). Logs a warning so operators notice if
 *      pre-existing data already has the inconsistency.
 *   2. Drop the non-partial unique index.
 *   3. Recreate as two partial indexes:
 *        - `uq_actor_story_points_actor_world_set` ON (actor_id,
 *          world_id) WHERE world_id IS NOT NULL — the per-world case.
 *        - `uq_actor_story_points_actor_global` ON (actor_id)
 *          WHERE world_id IS NULL — the global balance case.
 *
 * Append-only policy (`src/db/migrations/README.md`): this is a
 * forward schema change, not a rewrite of 019.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // Defensive dedupe (Step 1): find actors with more than one
  // NULL-world row and collapse them.
  const dupActors = await sql<{ actor_id: string; n: number }>`
    SELECT actor_id, COUNT(*) AS n
    FROM actor_story_points
    WHERE world_id IS NULL
    GROUP BY actor_id
    HAVING COUNT(*) > 1
  `.execute(database,);

  for (const dup of dupActors.rows) {
    // BUG-migration-020-logs-via-console-warn-with-eslint-disable: process.emitWarning
    // is the repo's warning channel (config/templates-loader, entity-position.ts);
    // console.warn would need an eslint-disable and bypasses the structured sink.
    process.emitWarning(
      `[020_actor_story_points_partial_unique] actor ${dup.actor_id} has ${dup.n} duplicate NULL-world rows; collapsing to oldest.`,
    );

    const survivor = await sql<{ id: string }>`
      SELECT id FROM actor_story_points
      WHERE actor_id = ${dup.actor_id} AND world_id IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `.execute(database,);

    const survivorId = survivor.rows[0]?.id;
    if (!survivorId) { continue; }
    await sql`
      UPDATE actor_story_points
      SET
        balance = balance + COALESCE((
          SELECT SUM(balance) FROM actor_story_points
          WHERE actor_id = ${dup.actor_id} AND world_id IS NULL AND id != ${survivorId}
        ), 0),
        earned_total = earned_total + COALESCE((
          SELECT SUM(earned_total) FROM actor_story_points
          WHERE actor_id = ${dup.actor_id} AND world_id IS NULL AND id != ${survivorId}
        ), 0),
        spent_total = spent_total + COALESCE((
          SELECT SUM(spent_total) FROM actor_story_points
          WHERE actor_id = ${dup.actor_id} AND world_id IS NULL AND id != ${survivorId}
        ), 0),
        cap = COALESCE((
          SELECT cap FROM actor_story_points
          WHERE actor_id = ${dup.actor_id} AND world_id IS NULL AND id != ${survivorId} AND cap IS NOT NULL
          LIMIT 1
        ), cap),
        updated_at = datetime('now')
      WHERE id = ${survivorId}
    `.execute(database,);

    await sql`
      DELETE FROM actor_story_points
      WHERE actor_id = ${dup.actor_id} AND world_id IS NULL AND id != ${survivorId}
    `.execute(database,);
  }

  // Replace the index (Steps 2 + 3).
  await database.schema
    .dropIndex("uq_actor_story_points_actor_world",)
    .execute();

  await sql`
    CREATE UNIQUE INDEX uq_actor_story_points_actor_world_set
    ON actor_story_points (actor_id, world_id)
    WHERE world_id IS NOT NULL
  `.execute(database,);

  await sql`
    CREATE UNIQUE INDEX uq_actor_story_points_actor_global
    ON actor_story_points (actor_id)
    WHERE world_id IS NULL
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .dropIndex("uq_actor_story_points_actor_global",)
    .execute();

  await database.schema
    .dropIndex("uq_actor_story_points_actor_world_set",)
    .execute();

  await database.schema
    .createIndex("uq_actor_story_points_actor_world",)
    .on("actor_story_points",)
    .columns(["actor_id", "world_id",],)
    .unique()
    .execute();
}
