// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Workflow run sessions (epic-assistant-creative-studio-workflows).
 *
 * Persists the in-memory runs from `src/assistant/workflow-session.ts` so a
 * restart or a second process does not lose an active run mid-flow. One row
 * per chat (chat_id PK, cascade on chat delete); `step_values` holds the
 * run's filled values as JSON; `updated_at` drives stale-run expiry.
 *
 * Numbered 021: 020_memories_fts_triggers belongs to the search-unified
 * worktree (unmerged) — do not collide.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { recordSchemaVersion, } from "../../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("workflow_sessions",)
    .addColumn("chat_id", "text", (col,) => col.primaryKey().references("chats.id",).onDelete("cascade",),)
    .addColumn("workflow_id", "text", (col,) => col.notNull(),)
    .addColumn("step_values", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("confirmed", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await recordSchemaVersion(database, 21, "workflow run sessions",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("workflow_sessions",).execute();
}
