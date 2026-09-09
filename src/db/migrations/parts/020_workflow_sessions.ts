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
 * Renamed 021 -> 020: the search-unified worktree holding
 * 020_memories_fts_triggers is gone, and 020 was folded into 016.
 * Coordinator mesh tables ride this part (fold per user decision).
 * Recovery for pre-rename DBs: update kysely_migration set
 * name='020_workflow_sessions' where name='021_workflow_sessions'.
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

  // Coordinator role (mesh-followup decision): peer registry + negotiation
  // state. Metadata/control plane only — never plaintext content.
  await database.schema
    .createTable("mesh_peers",)
    .addColumn("origin", "text", (col,) => col.primaryKey(),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("capabilities", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("last_seen", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createTable("mesh_negotiations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull().references("mesh_peers.origin",).onDelete("cascade",),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("idle",),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("mesh_negotiations",).execute();
  await database.schema.dropTable("mesh_peers",).execute();
  await database.schema.dropTable("workflow_sessions",).execute();
}
