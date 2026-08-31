// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World Timelines — DB Schema
 *
 * Adds the `world_timelines` table to track named timeline branches per world.
 * The `'prime'` timeline is the default for all existing worlds (created
 * automatically on first world access via the application schema seed).
 *
 * Schema:
 *   world_timelines — one row per (world, timeline_name) pair.
 *                     'prime' is the canonical default; no two timelines in a
 *                     world may share the same name.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("world_timelines",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",).notNull(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("is_prime", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  // One name per world — no duplicate timeline names.
  await db.schema
    .createIndex("idx_world_timelines_world_name",)
    .on("world_timelines",)
    .columns(["world_id", "name",],)
    .execute();

  // Index for listing timelines belonging to a world.
  await db.schema
    .createIndex("idx_world_timelines_world",)
    .on("world_timelines",)
    .column("world_id",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("idx_world_timelines_world",).execute();
  await db.schema.dropIndex("idx_world_timelines_world_name",).execute();
  await db.schema.dropTable("world_timelines",).execute();
}
