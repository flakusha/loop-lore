// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 115_rsi_agent_worktrees
 *
 * Companion registry for the RSI agent worktree-spawn surface (RSI tickets
 * #6/#9, re-applied from the agent-api collision handover): one row per
 * spawned agent worktree, owned by the `agent_tokens` row (migration 114)
 * that created it.
 *
 *  - `token_id` is a hard FK with `ON DELETE CASCADE`: a minted-then-revoked
 *    token's registry rows cannot outlive the credential audit trail.
 *  - `path` is UNIQUE — one filesystem worktree per row; the spawn route
 *    derives it from the row id (`tree/agent-<uuid>/`).
 *  - `disk_bytes` is the measured tree size at registration (the 500MB cap
 *    re-checks lazily on the idle sweep).
 *  - `removed_at` is the ROW VALUE tombstone (not a DELETE): live rows are
 *    `removed_at IS NULL`; the per-token (5) and global (10) concurrency caps
 *    and the 24h idle sweeper in `src/agent/cleanup.ts` all read live rows.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("rsi_agent_worktrees",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("token_id", "text", (col,) => col.notNull().references("agent_tokens.id",).onDelete("cascade",),)
    .addColumn("branch", "text", (col,) => col.notNull(),)
    .addColumn("path", "text", (col,) => col.notNull().unique(),)
    .addColumn("disk_bytes", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_active_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("removed_at", "text",)
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_rsi_agent_worktrees_token
    ON rsi_agent_worktrees (token_id)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_rsi_agent_worktrees_token`.execute(database,);
  await database.schema.dropTable("rsi_agent_worktrees",).ifExists().execute();
}
