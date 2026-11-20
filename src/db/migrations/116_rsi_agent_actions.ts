// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 116_rsi_agent_actions
 *
 * Append-only audit trail for the `/api/v1/agent/*` surface (RSI #9). One row
 * per request, written at the single auth choke point in `src/agent/api/auth.ts`:
 *
 *  - `token_digest` is the FIRST 16 HEX CHARS of the SHA-256 of the bearer
 *    token (the same fingerprint `agent_tokens.token_hash` is derived from),
 *    never the plaintext. `"none"` marks a request with no bearer at all.
 *    Deliberately NOT named `token_hash`: the rename-upgrade regression test
 *    scans every table outside the two known credential tables for that
 *    legacy column name, including index DDL.
 *  - `action` is the agent sub-route (`whoami`, `worktrees`, `check`).
 *  - `result` is the final outcome: `success` / `failure` for authenticated
 *    calls (filled in by the router hook), or `denied` / `forbidden` /
 *    `rate_limited` for a request the guard rejected.
 *  - No FKs: the trail must outlive a revoked token or a removed worktree.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("agent_actions",)
    // Rowid alias: SQLite assigns ids without AUTOINCREMENT's sqlite_sequence
    // side table (the migration roundtrip tests require a clean down()).
    .addColumn("id", "integer", (col,) => col.primaryKey(),)
    .addColumn("token_digest", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text",)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("worktree_id", "text",)
    .addColumn("commit_hash", "text",)
    .addColumn("result", "text", (col,) => col.notNull(),)
    .addColumn("duration_ms", "integer",)
    .addColumn("metadata", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_actions_created_at
    ON agent_actions (created_at DESC)
  `.execute(database,);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_actions_token_digest
    ON agent_actions (token_digest)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_agent_actions_created_at`.execute(database,);
  await sql`DROP INDEX IF EXISTS idx_agent_actions_token_digest`.execute(database,);
  await database.schema.dropTable("agent_actions",).ifExists().execute();
}
