// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 119 — widens `ck_agent_tokens_scope` to admit `agent:tickets`.
 *
 * The rebuild must not destroy `expires_at` (owned by 118_agent_token_expiry):
 * both the column values and the partial index survive `up()` and `down()`.
 * When the column is absent (branch-only chain) nothing is invented.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";

const MIGRATION = "119_agent_tickets_scope";

const BASE_TABLE = `
  CREATE TABLE agent_tokens (
    id text PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    scope text NOT NULL,
    created_at text NOT NULL,
    revoked_at text,
    last_used_at text
  )
`;

const WITH_EXPIRY_TABLE = `
  CREATE TABLE agent_tokens (
    id text PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    scope text NOT NULL,
    created_at text NOT NULL,
    revoked_at text,
    last_used_at text,
    expires_at text
  )
`;

const EXPIRY_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_agent_tokens_expires_at
  ON agent_tokens (expires_at) WHERE expires_at IS NOT NULL
`;

describe("119_agent_tickets_scope", () => {
  let raw: Database;
  let db: Kysely<unknown>;

  beforeEach(() => {
    raw = new Database(":memory:",);
    db = new Kysely({ dialect: createSqliteDialect(raw,), },);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  const columnNames = (): string[] =>
    (raw.query("PRAGMA table_info(agent_tokens)",).all() as { name: string }[]).map((col,) => col.name);

  const indexSql = (): string[] =>
    (
      raw.query(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_agent_tokens_expires_at'",
      ).all() as { sql: string }[]
    ).map((row,) => row.sql);

  test("up keeps the expiry column, its values and the partial index", async () => {
    raw.exec(WITH_EXPIRY_TABLE,);
    raw.exec(EXPIRY_INDEX,);
    raw.exec(
      "INSERT INTO agent_tokens (id, token_hash, scope, created_at, expires_at) VALUES ('a', 'hash-a', 'agent:check', 'now', '2030-01-01T00:00:00Z')",
    );

    raw.exec(
      "INSERT INTO agent_tokens (id, token_hash, scope, created_at) VALUES ('b', 'hash-b', 'agent:commit', 'now')",
    );

    const migrations = await getMigrationFiles();
    const migration = migrations[MIGRATION];
    expect(migration,).toBeDefined();

    await migration!.up(db,);

    expect(columnNames(),).toContain("expires_at",);

    const rows = raw.query("SELECT id, expires_at FROM agent_tokens ORDER BY id",).all() as {
      id: string;
      expires_at: string | null;
    }[];

    expect(rows,).toHaveLength(2,);
    expect(rows[0]!.expires_at,).toBe("2030-01-01T00:00:00Z",);
    expect(rows[1]!.expires_at,).toBeNull();

    expect(indexSql(),).toHaveLength(1,);
    expect(indexSql()[0]!,).toContain("WHERE expires_at IS NOT NULL",);

    // The widened scope is admitted after the rebuild.
    raw.exec(
      "INSERT INTO agent_tokens (id, token_hash, scope, created_at) VALUES ('c', 'hash-c', 'agent:tickets', 'now')",
    );
  });

  test("down keeps the expiry column, its values and the partial index", async () => {
    raw.exec(WITH_EXPIRY_TABLE,);
    raw.exec(EXPIRY_INDEX,);
    raw.exec(
      "INSERT INTO agent_tokens (id, token_hash, scope, created_at, expires_at) VALUES ('a', 'hash-a', 'agent:check', 'now', '2030-01-01T00:00:00Z')",
    );

    const migrations = await getMigrationFiles();
    const migration = migrations[MIGRATION];
    expect(migration,).toBeDefined();

    await migration!.up(db,);
    await migration!.down!(db,);

    expect(columnNames(),).toContain("expires_at",);

    const rows = raw.query("SELECT id, expires_at FROM agent_tokens",).all() as {
      id: string;
      expires_at: string | null;
    }[];

    expect(rows[0]!.expires_at,).toBe("2030-01-01T00:00:00Z",);

    expect(indexSql(),).toHaveLength(1,);

    // The 114 scope set is restored: `agent:tickets` no longer fits the CHECK.
    expect(() =>
      raw.exec(
        "INSERT INTO agent_tokens (id, token_hash, scope, created_at) VALUES ('c', 'hash-c', 'agent:tickets', 'now')",
      )
    ).toThrow();
  });

  test("down refuses to roll back while agent:tickets tokens exist", async () => {
    raw.exec(WITH_EXPIRY_TABLE,);

    const migrations = await getMigrationFiles();
    const migration = migrations[MIGRATION];
    expect(migration,).toBeDefined();

    await migration!.up(db,);
    raw.exec(
      "INSERT INTO agent_tokens (id, token_hash, scope, created_at) VALUES ('c', 'hash-c', 'agent:tickets', 'now')",
    );

    expect(migration!.down!(db,),).rejects.toThrow(
      "119_agent_tickets_scope: cannot roll back while 'agent:tickets' tokens exist; revoke them first",
    );
  });

  test("a chain without expires_at is neither broken nor given the column", async () => {
    raw.exec(BASE_TABLE,);
    raw.exec(
      "INSERT INTO agent_tokens (id, token_hash, scope, created_at) VALUES ('a', 'hash-a', 'agent:check', 'now')",
    );

    const migrations = await getMigrationFiles();
    const migration = migrations[MIGRATION];
    expect(migration,).toBeDefined();

    await migration!.up(db,);
    expect(columnNames(),).not.toContain("expires_at",);
    expect(indexSql(),).toHaveLength(0,);

    await migration!.down!(db,);
    expect(columnNames(),).not.toContain("expires_at",);
    expect(indexSql(),).toHaveLength(0,);
  });

  test("up and down keep rsi_agent_worktrees rows across the rebuild", async () => {
    raw.exec(WITH_EXPIRY_TABLE,);
    raw.exec(`
      CREATE TABLE rsi_agent_worktrees (
        id text PRIMARY KEY,
        token_id text NOT NULL REFERENCES agent_tokens(id) ON DELETE CASCADE,
        branch text NOT NULL,
        path text NOT NULL UNIQUE,
        disk_bytes integer NOT NULL DEFAULT 0,
        created_at text NOT NULL,
        last_active_at text NOT NULL,
        removed_at text
      )
    `,);

    raw.exec(
      "INSERT INTO agent_tokens (id, token_hash, scope, created_at) VALUES ('a', 'hash-a', 'agent:check', 'now')",
    );

    raw.exec(
      "INSERT INTO rsi_agent_worktrees (id, token_id, branch, path, disk_bytes, created_at, last_active_at) VALUES ('w1', 'a', 'feature/x', 'tree/x', 42, 'now', 'now')",
    );

    const migrations = await getMigrationFiles();
    const migration = migrations[MIGRATION];
    expect(migration,).toBeDefined();

    const registryRows = (): unknown[] =>
      raw.query("SELECT id, token_id, branch, disk_bytes FROM rsi_agent_worktrees",).all();

    const expected = [{ id: "w1", token_id: "a", branch: "feature/x", disk_bytes: 42, },];

    await migration!.up(db,);
    expect(registryRows(),).toEqual(expected,);

    await migration!.down!(db,);
    expect(registryRows(),).toEqual(expected,);
    expect(raw.query("PRAGMA foreign_key_check",).all(),).toEqual([],);
  });
});
