// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 088_world_timeline_selections
 *
 * Per-user selected timeline branch per world (TASK-timeline-selection-api:
 * "Session stores selected timeline per world"). One row per (user_id,
 * world_id); the world-detail fragment falls back to this selection when no
 * explicit `?timeline=` query is given, and `POST .../timelines/:id/select`
 * upserts it.
 *
 * `timeline_id` references the `world_timelines` ROW (including the prime
 * row) with ON DELETE CASCADE: deleting a fork removes stale selections and
 * the loader falls back to the conventional `prime` slug branch. Resolving a
 * selected prime row to the `prime` event slug stays in the loader, matching
 * src/routes/views/worlds.ts.
 */
import { type Kysely, } from "kysely";

/** */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("world_timeline_selections",)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("timeline_id", "text", (col,) => col.notNull().references("world_timelines.id",).onDelete("cascade",),)
    .addColumn("selected_at", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_world_timeline_selections", ["user_id", "world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_world_timeline_selections_world",)
    .on("world_timeline_selections",)
    .column("world_id",)
    .execute();
}

/** */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_world_timeline_selections_world",).execute();
  await database.schema.dropTable("world_timeline_selections",).execute();
}
