// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema behavior for agent token expiry.
 *
 * The retired 118 migration added the nullable `agent_tokens.expires_at` and
 * its partial index. In the 14-file baseline both ship inline. A token written
 * without an expiry keeps the legacy meaning: NULL = never expires.
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

describe("agent token expiry (final schema)", () => {
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

  test("expires_at is present and nullable", () => {
    const columns = raw.query("PRAGMA table_info(agent_tokens)",).all() as {
      name: string;
      notnull: number;
    }[];

    const expiry = columns.find((c,) => c.name === "expires_at");
    expect(expiry,).toBeDefined();
    expect(expiry!.notnull,).toBe(0,);
  });

  test("the partial index covers only expiring rows", () => {
    const rows = raw
      .query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_agent_tokens_expires_at'",)
      .all() as { sql: string }[];

    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.sql,).toContain("WHERE expires_at IS NOT NULL",);
  });

  test("a legacy-shaped token keeps NULL (never expires)", async () => {
    await sql`INSERT INTO agent_tokens (id, token_hash, scope, created_at)
      VALUES ('legacy', 'hash-legacy', 'agent:check', 'now')`.execute(db,);

    const { rows, } = await sql<{ expires_at: string | null }>`SELECT expires_at FROM agent_tokens`.execute(db,);
    expect(rows[0]!.expires_at,).toBeNull();
  });

  test("an explicit expiry round-trips", async () => {
    await sql`INSERT INTO agent_tokens (id, token_hash, scope, created_at, expires_at)
      VALUES ('expiring', 'hash-expiring', 'agent:check', 'now', '2030-01-01T00:00:00Z')`.execute(db,);

    const { rows, } = await sql<{ expires_at: string | null }>`SELECT expires_at FROM agent_tokens`.execute(db,);
    expect(rows[0]!.expires_at,).toBe("2030-01-01T00:00:00Z",);
  });
});
