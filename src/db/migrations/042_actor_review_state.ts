// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 042_actor_review_state
 *
 * Add review_state column to actors table for character approval workflow.
 * Default is 'pending_review' so new characters enter the review queue.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actors",)
    .addColumn("review_state", "text", (col,) => col.notNull().defaultTo("pending_review",),)
    .execute();

  await database.schema
    .createIndex("idx_actors_review_state",)
    .on("actors",)
    .column("review_state",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // Drop the index first: SQLite refuses ALTER TABLE ... DROP COLUMN while an
  // index still references the column ("error in index ... no such column").
  await database.schema.dropIndex("idx_actors_review_state",).execute();
  await database.schema.alterTable("actors",).dropColumn("review_state",).execute();
}
