// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor status effects — shared NSFW game-mechanics store (TASK-035/039/044).
 *
 * One row per applied status effect on an actor (pheromones, trauma,
 * reproductive complications, ...). Expiry is computed on read by
 * comparing `expires_at` to the current time — no timers; a sweep
 * deletes expired rows. `meta` holds a caller-defined JSON payload.
 */
import type { Kysely, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("status_effect",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("effect_id", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("affected_stat", "text",)
    .addColumn("magnitude", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text",)
    .addColumn("started_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("meta", "text",)
    .execute();
  await database.schema
    .createIndex("idx_status_effect_actor_effect",)
    .on("status_effect",)
    .columns(["actor_id", "effect_id",],)
    .execute();
  await recordSchemaVersion(database, 38, "actor status effects",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("status_effect",).execute();
}
