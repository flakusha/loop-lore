// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 019_actor_story_points
 *
 * Player-agency story points (Bennies / FATE points / Inspiration).
 *
 *   - `actor_story_points` — per-(actor, world) balance with lifetime
 *     earn/spend counters and an optional cap. NULL `world_id` means a
 *     global balance (cross-world).
 *
 * Story points are consumed by reroll/retry/achievement-reward flows
 * (see `services/agency/story-points.ts`).
 *
 * Resolves: TASK-story-points-prototype, TASK-agency-story-points,
 *           FEAT-story-points-actor-properties-storypoints-agency-slash-comma
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("actor_story_points",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("balance", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("earned_total", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("spent_total", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("cap", "integer",)
    .addColumn("last_earn_at", "text",)
    .addColumn("last_spend_at", "text",)
    .addColumn("last_earn_reason", "text",)
    .addColumn("last_spend_reason", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("uq_actor_story_points_actor_world",)
    .on("actor_story_points",)
    .columns(["actor_id", "world_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_actor_story_points_actor",)
    .on("actor_story_points",)
    .column("actor_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_actor_story_points_actor",).execute();
  await database.schema.dropIndex("uq_actor_story_points_actor_world",).execute();
  await database.schema.dropTable("actor_story_points",).execute();
}
