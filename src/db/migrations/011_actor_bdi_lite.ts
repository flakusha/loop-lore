// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 011_actor_bdi_lite
 *
 * BDI-lite reflection tables (TASK-agency-bdi-reflection-cycle):
 *   - `actor_daily_plans` — per-actor-per-day aspiration snapshot
 *   - `actor_planned_activities` — concrete sub-activities within a plan
 *   - `actor_chat_buffers` — cooldown tracking to prevent same-partner spam
 *   - `actor_plan_revisions` — emitted when reflection shifts priorities
 *
 * Ponytail notes:
 *   - `actor_chat_buffers.cooldown_minutes` and `max_consecutive_chats` are
 *     enforced in application code, NOT via SQLite CHECK constraints.
 *     SQLite CHECK can't reference time-difference functions portably without
 *     triggers; simpler and equivalent to enforce in `bdi-nightly.ts`.
 *   - `priority` is text (not enum) to keep migrations append-only; new tiers
 *     do not require a schema change.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("actor_daily_plans",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("plan_date", "text", (col,) => col.notNull(),)
    .addColumn("summary", "text", (col,) => col.notNull(),)
    .addColumn("priority", "text", (col,) => col.notNull().defaultTo("normal"),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_actor_daily_plans_actor_date",)
    .on("actor_daily_plans",)
    .columns(["actor_id", "plan_date"],)
    .execute();

  await database.schema
    .createTable("actor_planned_activities",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("plan_id", "text", (col,) => col.notNull().references("actor_daily_plans.id",),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("score", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("completed", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_actor_planned_activities_plan",)
    .on("actor_planned_activities",)
    .column("plan_id",)
    .execute();

  await database.schema
    .createTable("actor_chat_buffers",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("partner_actor_id", "text", (col,) => col.notNull(),)
    .addColumn("last_chat_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("consecutive_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("cooldown_minutes", "integer", (col,) => col.notNull().defaultTo(15,),)
    .addColumn("max_consecutive_chats", "integer", (col,) => col.notNull().defaultTo(3,),)
    .execute();

  // Ponytail: cooldown enforcement lives in `bdi-nightly.ts` (SQLite CHECK
  // can't reference time-diff functions portably without triggers).
  await database.schema
    .createIndex("uq_actor_chat_buffers_pair",)
    .on("actor_chat_buffers",)
    .columns(["actor_id", "partner_actor_id"],)
    .unique()
    .execute();

  await database.schema
    .createTable("actor_plan_revisions",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("plan_id", "text", (col,) => col.notNull().references("actor_daily_plans.id",),)
    .addColumn("revision_kind", "text", (col,) => col.notNull(),)
    .addColumn("before_priority", "text", (col,) => col.notNull(),)
    .addColumn("after_priority", "text", (col,) => col.notNull(),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_actor_plan_revisions_plan",)
    .on("actor_plan_revisions",)
    .column("plan_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("actor_plan_revisions",).execute();
  await database.schema.dropIndex("uq_actor_chat_buffers_pair",).execute();
  await database.schema.dropTable("actor_chat_buffers",).execute();
  await database.schema.dropIndex("idx_actor_planned_activities_plan",).execute();
  await database.schema.dropTable("actor_planned_activities",).execute();
  await database.schema.dropIndex("idx_actor_daily_plans_actor_date",).execute();
  await database.schema.dropTable("actor_daily_plans",).execute();
}
