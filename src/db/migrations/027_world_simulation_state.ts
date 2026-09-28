// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 027_world_simulation_state
 *
 * Per-world simulation cursor for the autonomy scheduler
 * (TASK-story-auto-drive-scheduler). One row per world so the tick
 * loop survives a process restart without double-dispatch: the
 * scheduler reads `next_tick_at`, ticks the world, then writes the
 * advanced cursor.
 *
 *   - `next_tick_at` — ISO-8601 instant the world becomes due. Due
 *     selection is `next_tick_at <= now AND paused = 0`, ordered by
 *     `(next_tick_at ASC, world_id ASC)` for deterministic tie-breaks.
 *   - `paused`        — 1 = admin-paused; excluded from due selection
 *     but still eligible for explicit `stepOnce`.
 *   - `last_error`    — last dispatch error text, cleared on success.
 *   - `tick_count`    — monotonic per-world dispatch counter.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("world_simulation_state",)
    .addColumn("world_id", "text", (col,) => col.primaryKey().references("worlds.id",).onDelete("cascade",),)
    .addColumn("next_tick_at", "text", (col,) => col.notNull(),)
    .addColumn("paused", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("last_run_at", "text",)
    .addColumn("last_error", "text",)
    .addColumn("tick_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_world_simulation_state_due",)
    .on("world_simulation_state",)
    .columns(["paused", "next_tick_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_world_simulation_state_due",).execute();
  await database.schema.dropTable("world_simulation_state",).execute();
}
