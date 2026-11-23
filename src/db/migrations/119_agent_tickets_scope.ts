// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 119_agent_tickets_scope
 *
 * Widen `ck_agent_tokens_scope` on `agent_tokens` to admit `agent:tickets`
 * alongside the four 114 tiers (RSI #18). SQLite cannot ALTER a CHECK, so
 * the table is rebuilt column-for-column and every row copied unchanged;
 * the unique token_hash constraint is recreated identically.
 *
 * `expires_at` is owned by 118_agent_token_expiry and is not part of this
 * migration. The rebuild detects the column at runtime: when it is present
 * the values and the partial index `idx_agent_tokens_expires_at` are carried
 * over, when it is absent (branch-only chain) nothing is invented. Rolling
 * back 119 keeps the column as well, so 118 can still drop it.
 *
 * `down` restores the 114 constraint. An `agent:tickets` row cannot satisfy
 * it, so rollback throws rather than discarding data (same contract as 110).
 */
import { type Kysely, sql, } from "kysely";

/**
 * Does the live `agent_tokens` table carry the `expires_at` column added by
 * 118_agent_token_expiry? The column is optional for this migration: the
 * branch-only chain has no 118, the merged chain does.
 */
async function hasExpiresAt(database: Kysely<unknown>,): Promise<boolean> {
  const rows = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info('agent_tokens')
  `.execute(database,);

  return rows.rows.some((row,) => row.name === "expires_at");
}

/**
 * `rsi_agent_worktrees.token_id` has ON DELETE CASCADE, so DROP TABLE below
 * would silently delete the registry. Snapshot it before the rebuild (022
 * precedent) and restore it afterwards.
 */
async function snapshotAgentWorktrees(database: Kysely<unknown>,): Promise<boolean> {
  const rows = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rsi_agent_worktrees'
  `.execute(database,);

  if (rows.rows.length === 0) { return false; }

  await sql`DROP TABLE IF EXISTS temp.rsi_agent_worktrees_119_snapshot`.execute(database,);
  await sql`CREATE TEMP TABLE rsi_agent_worktrees_119_snapshot AS SELECT * FROM rsi_agent_worktrees`.execute(database,);
  return true;
}

async function restoreAgentWorktrees(database: Kysely<unknown>, snapshotted: boolean,): Promise<void> {
  if (!snapshotted) { return; }
  await sql`INSERT INTO rsi_agent_worktrees SELECT * FROM rsi_agent_worktrees_119_snapshot`.execute(database,);
  await sql`DROP TABLE rsi_agent_worktrees_119_snapshot`.execute(database,);
}

export async function up(database: Kysely<unknown>,): Promise<void> {
  const carriesExpiresAt = await hasExpiresAt(database,);
  const registrySnapshot = await snapshotAgentWorktrees(database,);

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

  if (carriesExpiresAt) {
    await sql`ALTER TABLE agent_tokens_new ADD COLUMN expires_at text`.execute(database,);
    await sql`
      UPDATE agent_tokens_new
      SET expires_at = (SELECT src.expires_at FROM agent_tokens src WHERE src.id = agent_tokens_new.id)
    `.execute(database,);
  }

  await database.schema.dropTable("agent_tokens",).execute();
  await database.schema.alterTable("agent_tokens_new",).renameTo("agent_tokens",).execute();
  await restoreAgentWorktrees(database, registrySnapshot,);

  if (carriesExpiresAt) {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_agent_tokens_expires_at
      ON agent_tokens (expires_at) WHERE expires_at IS NOT NULL
    `.execute(database,);
  }
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  const ticketRows = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM agent_tokens WHERE scope = 'agent:tickets'
  `.execute(database,);

  if (Number(ticketRows.rows[0]?.n ?? 0,) > 0) {
    throw new Error(
      "119_agent_tickets_scope: cannot roll back while 'agent:tickets' tokens exist; revoke them first",
    );
  }

  const carriesExpiresAt = await hasExpiresAt(database,);
  const registrySnapshot = await snapshotAgentWorktrees(database,);

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

  if (carriesExpiresAt) {
    await sql`ALTER TABLE agent_tokens_old ADD COLUMN expires_at text`.execute(database,);
    await sql`
      UPDATE agent_tokens_old
      SET expires_at = (SELECT src.expires_at FROM agent_tokens src WHERE src.id = agent_tokens_old.id)
    `.execute(database,);
  }

  await database.schema.dropTable("agent_tokens",).execute();
  await database.schema.alterTable("agent_tokens_old",).renameTo("agent_tokens",).execute();
  await restoreAgentWorktrees(database, registrySnapshot,);

  if (carriesExpiresAt) {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_agent_tokens_expires_at
      ON agent_tokens (expires_at) WHERE expires_at IS NOT NULL
    `.execute(database,);
  }
}
