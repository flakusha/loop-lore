// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 082_immersion_failed_checks
 *
 * Persistent pending-consequence state for the immersion consistency gate
 * (WI-3). One row per unresolved failed check (battle save/skill check,
 * dice outcome) that constrains the actor's follow-up claims until a
 * narrative beat resolves it. Open rows (`resolved_at IS NULL`) are read
 * by the gate's default `PendingConsequenceLoader`; `resolveFailedCheck`
 * closes them once the constrained action has been narrated as failed.
 *
 * No FKs: mirrors `dice_roll_history`, whose chat/actor columns are loose
 * references so orphan rows never block writes.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("immersion_failed_checks",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("blocked_action", "text", (col,) => col.notNull(),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull().defaultTo("manual",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("resolved_at", "text",)
    .execute();

  await database.schema
    .createIndex("idx_immersion_failed_checks_open",)
    .on("immersion_failed_checks",)
    .columns(["chat_id", "actor_id", "resolved_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .dropIndex("idx_immersion_failed_checks_open",)
    .on("immersion_failed_checks",)
    .execute();

  await database.schema.dropTable("immersion_failed_checks",).execute();
}
