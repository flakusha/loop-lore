// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema behavior for agent ticket scopes.
 *
 * The retired 119 migration widened `ck_agent_tokens_scope` to admit
 * `agent:tickets`. The 14-file baseline ships the widened CHECK inline, along
 * with the expires_at column and its partial index. The load-bearing oracle is
 * that rebuilding/owning `agent_tokens` never orphaned rsi_agent_worktrees
 * rows: full child rows survive, foreign_key_check stays clean, and a bogus
 * token_id is still rejected.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";

import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";

/** Apply the 14-file baseline to this test's isolated in-memory DB. */
async function applyBaseline(database: Kysely<unknown>,): Promise<void> {
  for (const migration of Object.values(await getMigrationFiles(),)) {
    await migration.up(database,);
  }
}

describe("agent tickets scope (final schema)", () => {
  let raw: Database;
  let db: Kysely<unknown>;

  beforeEach(async () => {
    raw = new Database(":memory:",);
    db = new Kysely({ dialect: createSqliteDialect(raw,), },);
    await applyBaseline(db,);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  function foreignKeyViolations(): unknown[] {
    return raw.query("PRAGMA foreign_key_check",).all();
  }

  test("agent:tickets is admitted and expiry survives", async () => {
    await sql`INSERT INTO agent_tokens (id, token_hash, scope, created_at, expires_at)
      VALUES ('a', 'hash-a', 'agent:check', 'now', '2030-01-01T00:00:00Z')`.execute(db,);

    await sql`INSERT INTO agent_tokens (id, token_hash, scope, created_at)
      VALUES ('b', 'hash-b', 'agent:commit', 'now')`.execute(db,);

    await sql`INSERT INTO agent_tokens (id, token_hash, scope, created_at)
      VALUES ('c', 'hash-c', 'agent:tickets', 'now')`.execute(db,);

    const { rows, } = await sql`SELECT id, expires_at FROM agent_tokens ORDER BY id`.execute(db,);
    expect(rows as { id: string; expires_at: string | null }[],).toEqual([
      { id: "a", expires_at: "2030-01-01T00:00:00Z", },
      { id: "b", expires_at: null, },
      { id: "c", expires_at: null, },
    ],);

    // The CHECK is still enforced — this is not a free-for-all text column.
    await expect(
      sql`INSERT INTO agent_tokens (id, token_hash, scope, created_at)
        VALUES ('d', 'hash-d', 'agent:bogus', 'now')`.execute(db,),
    ).rejects.toThrow(/CHECK/i,);

    const indexes = raw
      .query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_agent_tokens_expires_at'",)
      .all() as { sql: string }[];

    expect(indexes,).toHaveLength(1,);
    expect(indexes[0]!.sql,).toContain("WHERE expires_at IS NOT NULL",);
  }, 15000,);

  test("child rows survive with full values and FK integrity intact", async () => {
    await sql`INSERT INTO agent_tokens (id, token_hash, scope, created_at)
      VALUES ('a', 'hash-a', 'agent:check', 'now')`.execute(db,);

    await sql`INSERT INTO rsi_agent_worktrees
        (id, token_id, branch, path, disk_bytes, created_at, last_active_at)
      VALUES ('w1', 'a', 'feature/x', 'tree/x', 42, 'now', 'now')`.execute(db,);

    const rows = raw
      .query(
        "SELECT id, token_id, branch, path, disk_bytes, created_at, last_active_at, removed_at FROM rsi_agent_worktrees",
      )
      .all();

    expect(rows,).toEqual([{
      id: "w1",
      token_id: "a",
      branch: "feature/x",
      path: "tree/x",
      disk_bytes: 42,
      created_at: "now",
      last_active_at: "now",
      removed_at: null,
    },],);

    expect(foreignKeyViolations(),).toEqual([],);
  });

  test("a bogus token_id is rejected by the live FK", async () => {
    await expect(
      sql`INSERT INTO rsi_agent_worktrees
          (id, token_id, branch, path, created_at, last_active_at)
        VALUES ('w2', 'bogus', 'feature/y', 'tree/y', 'now', 'now')`.execute(db,),
    ).rejects.toThrow(/FOREIGN KEY/i,);

    expect(foreignKeyViolations(),).toEqual([],);
  });

  test("deleting a token cascades its worktree rows", async () => {
    await sql`INSERT INTO agent_tokens (id, token_hash, scope, created_at)
      VALUES ('a', 'hash-a', 'agent:tickets', 'now')`.execute(db,);

    await sql`INSERT INTO rsi_agent_worktrees
        (id, token_id, branch, path, created_at, last_active_at)
      VALUES ('w1', 'a', 'feature/x', 'tree/x', 'now', 'now')`.execute(db,);

    await sql`DELETE FROM agent_tokens WHERE id = 'a'`.execute(db,);

    const count = raw.query("SELECT COUNT(*) AS n FROM rsi_agent_worktrees",).get() as { n: number };
    expect(count.n,).toBe(0,);
    expect(foreignKeyViolations(),).toEqual([],);
  }, 15000,);
});
