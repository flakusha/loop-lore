// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 118 — additive `agent_tokens.expires_at` column and the partial
 * index over expiring rows. The old six-column row shape is the fixture:
 * a pre-existing token must keep working with a NULL (never-expires) value.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";

const MIGRATION = "118_agent_token_expiry";

describe("118_agent_token_expiry", () => {
  let raw: Database;
  let db: Kysely<unknown>;

  beforeEach(() => {
    raw = new Database(":memory:",);
    db = new Kysely({ dialect: createSqliteDialect(raw,), },);
    raw.exec(`
      CREATE TABLE agent_tokens (
        id text PRIMARY KEY,
        token_hash text NOT NULL UNIQUE,
        scope text NOT NULL,
        created_at text NOT NULL,
        revoked_at text,
        last_used_at text
      )
    `,);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  test("up adds a nullable expiry and a partial index; down removes both", async () => {
    const migrations = await getMigrationFiles();
    const migration = migrations[MIGRATION];
    expect(migration,).toBeDefined();

    await migration!.up(db,);

    const columns = raw.query("PRAGMA table_info(agent_tokens)",).all() as { name: string }[];
    expect(columns.map((col,) => col.name),).toContain("expires_at",);

    const index = raw.query(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_agent_tokens_expires_at'",
    ).all() as { sql: string }[];

    expect(index,).toHaveLength(1,);
    expect(index[0]!.sql,).toContain("WHERE expires_at IS NOT NULL",);

    // Legacy six-column rows keep their meaning: NULL = no expiry.
    raw.exec(
      "INSERT INTO agent_tokens (id, token_hash, scope, created_at) VALUES ('legacy', 'hash', 'agent:check', 'now')",
    );

    const row = raw.query("SELECT expires_at FROM agent_tokens",).all() as {
      expires_at: string | null;
    }[];

    expect(row[0]!.expires_at,).toBeNull();

    await migration!.down!(db,);

    const afterColumns = raw.query("PRAGMA table_info(agent_tokens)",).all() as { name: string }[];
    expect(afterColumns.map((col,) => col.name),).not.toContain("expires_at",);
    const afterIndex = raw.query(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_agent_tokens_expires_at'",
    ).all();

    expect(afterIndex,).toHaveLength(0,);
  });
});
