// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 070 — Message seen-state ledger
 *
 * Adds the `message_seen` table: a per-actor per-message viewership ledger
 * covering both human users and AI characters (via `actor_id`).
 *
 * States (mirroring `MessageSeenState` in `src/db/enums-core/flags.ts`):
 *   unseen     — actor has not yet seen or begun processing the message
 *   processing — AI actor admitted to process (rate-limit / batch planning)
 *   seen       — actor has seen the message (human confirmed or AI responded)
 *
 * Schema mirrors `message_reactions` (migration 009) but widened to `actor_id`
 * and with a `state` column + `seen_at` timestamp instead of an emoji.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("message_seen",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "message_id",
      "text",
      (col,) => col.notNull().references("messages.id",).onDelete("cascade",),
    )
    .addColumn(
      "actor_id",
      "text",
      (col,) => col.notNull().references("actors.id",).onDelete("cascade",),
    )
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("unseen",),)
    .addColumn("seen_at", "text",) // set when state first reaches "seen" or "processing"
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_seen_message",)
    .on("message_seen",)
    .column("message_id",)
    .execute();

  await database.schema
    .createIndex("idx_seen_actor",)
    .on("message_seen",)
    .column("actor_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("message_seen",).ifExists().execute();
}
