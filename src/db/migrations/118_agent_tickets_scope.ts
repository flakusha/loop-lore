// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 118_agent_tickets_scope
 *
 * Widen `ck_agent_tokens_scope` on `agent_tokens` to admit `agent:tickets`
 * alongside the four 114 tiers (RSI #18). SQLite cannot ALTER a CHECK, so
 * the table is rebuilt column-for-column and every row copied unchanged;
 * the unique token_hash constraint is recreated identically.
 *
 * `down` restores the 114 constraint. An `agent:tickets` row cannot satisfy
 * it, so rollback throws rather than discarding data (same contract as 110).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("agent_tokens_new",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("token_hash", "text", (col,) => col.notNull().unique(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("revoked_at", "text",)
    .addColumn("last_used_at", "text",)
    .addCheckConstraint(
      "ck_agent_tokens_scope",
      sql`(scope IN ('agent:worktree', 'agent:check', 'agent:commit', 'agent:finalize', 'agent:tickets'))`,
    )
    .execute();

  await sql`
    INSERT INTO agent_tokens_new (id, token_hash, scope, created_at, revoked_at, last_used_at)
    SELECT id, token_hash, scope, created_at, revoked_at, last_used_at FROM agent_tokens
  `.execute(database,);

  await database.schema.dropTable("agent_tokens",).execute();
  await database.schema.alterTable("agent_tokens_new",).renameTo("agent_tokens",).execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  const ticketRows = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM agent_tokens WHERE scope = 'agent:tickets'
  `.execute(database,);

  if (Number(ticketRows.rows[0]?.n ?? 0,) > 0) {
    throw new Error(
      "118_agent_tickets_scope: cannot roll back while 'agent:tickets' tokens exist; revoke them first",
    );
  }

  await database.schema
    .createTable("agent_tokens_old",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("token_hash", "text", (col,) => col.notNull().unique(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("revoked_at", "text",)
    .addColumn("last_used_at", "text",)
    .addCheckConstraint(
      "ck_agent_tokens_scope",
      sql`(scope IN ('agent:worktree', 'agent:check', 'agent:commit', 'agent:finalize'))`,
    )
    .execute();

  await sql`
    INSERT INTO agent_tokens_old (id, token_hash, scope, created_at, revoked_at, last_used_at)
    SELECT id, token_hash, scope, created_at, revoked_at, last_used_at FROM agent_tokens
  `.execute(database,);

  await database.schema.dropTable("agent_tokens",).execute();
  await database.schema.alterTable("agent_tokens_old",).renameTo("agent_tokens",).execute();
}
