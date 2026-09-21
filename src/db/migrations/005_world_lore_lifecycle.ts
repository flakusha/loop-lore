// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 005_world_lore_lifecycle
 *
 * Add lifecycle metadata to `world_lore_entries`: confidence (0..100),
 * last_verified timestamp, source_count (independent corroborations),
 * distortion_level (0..100, propagated noise / wear), disputed (0/1).
 *
 * Backward-compatible defaults: confidence=100, distortion_level=0,
 * last_verified=NULL (=> no decay until verified), source_count=1,
 * disputed=0. Existing rows behave identically to today unless the world
 * opts in to a `lifecycle_config` block in `worlds.rules` JSON.
 *
 * Resolves: TASK-world-lore-lifecycle-confidence-decay-distortion
 *
 * Append-only; 001_init.ts is shipped.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // SQLite only allows one column per ALTER TABLE.
  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn(
      "confidence",
      "real",
      (col,) => col.notNull().defaultTo(100,),
    )
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("last_verified", "text",)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn(
      "source_count",
      "integer",
      (col,) => col.notNull().defaultTo(1,),
    )
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn(
      "distortion_level",
      "real",
      (col,) => col.notNull().defaultTo(0,),
    )
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn(
      "disputed",
      "integer",
      (col,) => col.notNull().defaultTo(0,),
    )
    .execute();

  // Confidence range guard (0..100). Cheap sanity floor; the prompt-side
  // `effectiveConfidence` resolver applies decay + distortion on top.
  await sql`
      CREATE TRIGGER IF NOT EXISTS world_lore_entries_confidence_check
      BEFORE INSERT ON world_lore_entries
      FOR EACH ROW
      WHEN NEW.confidence < 0 OR NEW.confidence > 100
      BEGIN
        SELECT RAISE(ABORT, 'world_lore_entries.confidence must be 0..100');
      END;
    `.execute(database,);

  await sql`
      CREATE TRIGGER IF NOT EXISTS world_lore_entries_distortion_check
      BEFORE INSERT ON world_lore_entries
      FOR EACH ROW
      WHEN NEW.distortion_level < 0 OR NEW.distortion_level > 100
      BEGIN
        SELECT RAISE(ABORT, 'world_lore_entries.distortion_level must be 0..100');
      END;
    `.execute(database,);

  await sql`
      CREATE INDEX IF NOT EXISTS idx_world_lore_lifecycle
      ON world_lore_entries (world_id, confidence, disputed)
    `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_world_lore_lifecycle`.execute(
    database,
  );
  await sql`DROP TRIGGER IF EXISTS world_lore_entries_distortion_check`.execute(
    database,
  );
  await sql`DROP TRIGGER IF EXISTS world_lore_entries_confidence_check`.execute(
    database,
  );
  await database.schema.alterTable("world_lore_entries",).dropColumn("disputed",).execute();
  await database.schema.alterTable("world_lore_entries",).dropColumn("distortion_level",).execute();
  await database.schema.alterTable("world_lore_entries",).dropColumn("source_count",).execute();
  await database.schema.alterTable("world_lore_entries",).dropColumn("last_verified",).execute();
  await database.schema.alterTable("world_lore_entries",).dropColumn("confidence",).execute();
}
