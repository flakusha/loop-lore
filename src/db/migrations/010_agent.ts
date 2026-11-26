// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 010_agent — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("assistant_quota_usage",)
    .addColumn("user_id", "text", (col,) => col.primaryKey(),)
    .addColumn("window_start", "text", (col,) => col.notNull(),)
    .addColumn("used_units", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .execute();

  await database.schema
    .createTable("agent_tokens",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("token_hash", "text", (col,) => col.notNull().unique(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("revoked_at", "text",)
    .addColumn("last_used_at", "text",)
    .addColumn("expires_at", "text",)
    .addCheckConstraint(
      "ck_agent_tokens_scope",
      sql`(scope IN ('agent:worktree', 'agent:check', 'agent:commit', 'agent:finalize', 'agent:tickets'))`,
    )
    .execute();

  await database.schema
    .createTable("rsi_agent_worktrees",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("token_id", "text", (col,) => col.notNull().references("agent_tokens.id",).onDelete("cascade",),)
    .addColumn("branch", "text", (col,) => col.notNull(),)
    .addColumn("path", "text", (col,) => col.notNull().unique(),)
    .addColumn("disk_bytes", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_active_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("removed_at", "text",)
    .execute();

  await database.schema
    .createTable("agent_actions",)
    .addColumn("id", "integer", (col,) => col.primaryKey(),)
    .addColumn("token_digest", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text",)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("worktree_id", "text",)
    .addColumn("commit_hash", "text",)
    .addColumn("result", "text", (col,) => col.notNull(),)
    .addColumn("duration_ms", "integer",)
    .addColumn("metadata", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  // raw index: idx_agent_actions_created_at
  await sql`CREATE INDEX idx_agent_actions_created_at
    ON agent_actions (created_at DESC)
  `.execute(database,);

  // raw index: idx_agent_actions_token_digest
  await sql`CREATE INDEX idx_agent_actions_token_digest
    ON agent_actions (token_digest)
  `.execute(database,);

  // raw index: idx_agent_tokens_expires_at
  await sql`CREATE INDEX idx_agent_tokens_expires_at
      ON agent_tokens (expires_at) WHERE expires_at IS NOT NULL
    `.execute(database,);

  // raw index: idx_rsi_agent_worktrees_token
  await sql`CREATE INDEX idx_rsi_agent_worktrees_token
    ON rsi_agent_worktrees (token_id)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("agent_actions",).execute();
  await database.schema.dropTable("rsi_agent_worktrees",).execute();
  await database.schema.dropTable("agent_tokens",).execute();
  await database.schema.dropTable("assistant_quota_usage",).execute();
}
