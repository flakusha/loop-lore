// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Timeline Branching — world_timeline_events timeline_id
 *
 * Adds `timeline_id` to `world_timeline_events` so events can be scoped to
 * a specific timeline branch rather than being world-global.
 *
 * All existing rows default to `'prime'` — the canonical default timeline.
 * A new index on (world_id, timeline_id, occurred_at) enables fast per-timeline
 * queries without a join.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("world_timeline_events",)
    .addColumn("timeline_id", "text", (col,) => col.notNull().defaultTo("prime",),)
    .execute();

  await db.schema
    .createIndex("idx_wte_world_timeline_occurred",)
    .on("world_timeline_events",)
    .columns(["world_id", "timeline_id", "occurred_at",],)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .dropIndex("idx_wte_world_timeline_occurred",)
    .execute();
  await db.schema
    .alterTable("world_timeline_events",)
    .dropColumn("timeline_id",)
    .execute();
}
