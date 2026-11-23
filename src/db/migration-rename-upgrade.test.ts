/**
 * Final-schema verification for the 057 column-name disambiguation.
 *
 * The retired 057 migration renamed these columns in place. In the 14-file
 * baseline they are declared under their final names from the start, so the
 * upgrade fixture is gone. What survives here is the contract the rename
 * established: every new name exists, every old name is absent, values and
 * constraints (including the message_search_tokens composite PK) are live,
 * and no DDL left a stale reference behind.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";

import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";

/** Every rename 057 performed, as `[table, oldName, newName]`. */
const RENAMES: ReadonlyArray<readonly [string, string, string,]> = [
  ["users", "format_version", "row_version",],
  ["users", "password_hash", "secret_hash",],
  ["sessions", "token_hash", "secret_hash",],
  ["actors", "format_version", "row_version",],
  ["messages", "format_version", "row_version",],
  ["personas", "format_version", "row_version",],
  ["message_search_tokens", "token", "term",],
  ["character_avatar_config", "fallback_chain", "fallback_order",],
  ["request_results", "data_version", "content_version",],
  ["assets", "data_version", "content_version",],
  ["worlds", "data_version", "content_version",],
  ["characters", "data_version", "content_version",],
  ["character_stats", "data_version", "content_version",],
  ["chats", "data_version", "content_version",],
  ["messages", "data_version", "content_version",],
  ["items", "data_version", "content_version",],
  ["world_lore_entries", "data_version", "content_version",],
  ["actor_lore_entries", "data_version", "content_version",],
  ["quests", "data_version", "content_version",],
  ["locations", "data_version", "content_version",],
  ["blog_posts", "data_version", "content_version",],
  ["shadow_notes", "data_version", "content_version",],
  ["whitenotes", "data_version", "content_version",],
  ["crafting_recipes", "data_version", "content_version",],
];

/** Apply the 14-file baseline to this test's isolated in-memory DB. */
async function applyBaseline(database: Kysely<unknown>,): Promise<void> {
  for (const migration of Object.values(await getMigrationFiles(),)) {
    await migration.up(database,);
  }
}

function columnsOf(sqlite: Database, table: string,): string[] {
  return (sqlite.query(`PRAGMA table_info("${table}")`,).all() as { name: string }[]).map((r,) => r.name);
}

/** Seed one row per representative rename target through the final columns. */
async function seedRows(db: Kysely<unknown>,): Promise<void> {
  await sql`INSERT INTO users (id, username, display_name, secret_hash, row_version)
    VALUES ('user-1', 'upgrade-user', 'Upgrade User', 'digest-password', 3)`.execute(db,);

  await sql`INSERT INTO sessions (id, user_id, secret_hash, expires_at)
    VALUES ('sess-1', 'user-1', 'digest-token', '2099-01-01T00:00:00Z')`.execute(db,);

  await sql`INSERT INTO actors (id, display_name, row_version)
    VALUES ('actor-1', 'Upgrade Actor', 5)`.execute(db,);

  await sql`INSERT INTO personas (id, user_id, name, row_version)
    VALUES ('persona-1', 'user-1', 'Upgrade Persona', 7)`.execute(db,);

  await sql`INSERT INTO chats (id, name, created_by, content_version)
    VALUES ('chat-1', 'Upgrade Chat', 'user-1', 11)`.execute(db,);

  await sql`INSERT INTO messages (id, chat_id, actor_id, role, content, row_version, content_version)
    VALUES ('msg-1', 'chat-1', 'actor-1', 'user', 'upgrade fixture', 13, 17)`.execute(db,);

  await sql`INSERT INTO message_search_tokens (message_id, term, scope)
    VALUES ('msg-1', 'upgrade-term', 'all')`.execute(db,);

  await sql`INSERT INTO character_avatar_config
      (id, actor_id, fallback_order, created_at, updated_at)
    VALUES ('cac-1', 'actor-1', '["a","b"]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`.execute(db,);

  await sql`INSERT INTO worlds (id, owner_id, name, content_version)
    VALUES ('world-1', 'user-1', 'Upgrade World', 19)`.execute(db,);

  await sql`INSERT INTO assets
      (id, owner_id, filename, mime_type, asset_type, size_bytes, storage_path, content_version)
    VALUES ('asset-1', 'user-1', 'upgrade.png', 'image/png', 'image', 10, '/tmp/upgrade.png', 23)`.execute(db,);

  await sql`INSERT INTO character_stats (id, actor_id, hp, max_hp, ac, content_version)
    VALUES ('stats-1', 'actor-1', 10, 10, 10, 29)`.execute(db,);
}

describe("057 column names (final schema)", () => {
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

  test("every renamed column has its final name and no old name survives", () => {
    for (const [table, oldName, newName,] of RENAMES) {
      const cols = columnsOf(raw, table,);
      expect(cols, `${table}.${newName}`,).toContain(newName,);
      expect(cols, `${table}.${oldName} should be gone`,).not.toContain(oldName,);
    }
  });

  test("no DDL still references an old column name", () => {
    const ddl = raw.query("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL",).all() as { sql: string }[];
    // integration_tokens and agent_tokens legitimately own a token_hash for a
    // different credential; they are not leftovers of sessions.token_hash.
    const inScope = ddl.filter((d,) => !d.sql.includes("integration_tokens",) && !d.sql.includes("agent_tokens",));
    for (const old of ["format_version", "password_hash", "token_hash", "data_version", "fallback_chain",]) {
      expect(
        inScope.filter((d,) => d.sql.includes(old,)).map((d,) => d.sql.slice(0, 80,)),
        `no DDL still references ${old}`,
      ).toEqual([],);
    }
  });

  test("renamed values survive in their final columns", async () => {
    await seedRows(db,);
    expect(raw.query("SELECT secret_hash, row_version FROM users WHERE id = 'user-1'",).get(),).toEqual({
      secret_hash: "digest-password",
      row_version: 3,
    },);

    expect(raw.query("SELECT secret_hash FROM sessions WHERE id = 'sess-1'",).get(),).toEqual({
      secret_hash: "digest-token",
    },);

    expect(raw.query("SELECT row_version FROM actors WHERE id = 'actor-1'",).get(),).toEqual({ row_version: 5, },);
    expect(raw.query("SELECT row_version FROM personas WHERE id = 'persona-1'",).get(),).toEqual({ row_version: 7, },);
    expect(raw.query("SELECT row_version, content_version FROM messages WHERE id = 'msg-1'",).get(),).toEqual({
      row_version: 13,
      content_version: 17,
    },);

    expect(raw.query("SELECT term FROM message_search_tokens WHERE message_id = 'msg-1'",).get(),).toEqual({
      term: "upgrade-term",
    },);

    expect(raw.query("SELECT fallback_order FROM character_avatar_config WHERE id = 'cac-1'",).get(),).toEqual({
      fallback_order: '["a","b"]',
    },);

    expect(raw.query("SELECT content_version FROM assets WHERE id = 'asset-1'",).get(),).toEqual({
      content_version: 23,
    },);

    expect(raw.query("SELECT content_version, record_hash FROM character_stats WHERE id = 'stats-1'",).get(),).toEqual({
      content_version: 29,
      record_hash: "",
    },);

    expect(raw.query("PRAGMA foreign_key_check",).all(),).toEqual([],);
  }, 15000,);

  test("the message_search_tokens PK follows the rename and stays enforced", async () => {
    await seedRows(db,);
    const ddl = raw
      .query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'message_search_tokens'",)
      .get() as { sql: string };

    expect(ddl.sql,).toContain("term",);
    expect(ddl.sql,).not.toContain("token)",);
    expect(() =>
      raw.query(
        "INSERT INTO message_search_tokens (message_id, term, scope) VALUES (?, ?, ?)",
      ).run("msg-1", "upgrade-term", "all",)
    ).toThrow(/UNIQUE|PRIMARY KEY/i,);
  });

  test("row_version constraints and the sessions index track the new names", async () => {
    const info = raw.query("PRAGMA table_info(users)",).all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];

    const rowVersion = info.find((c,) => c.name === "row_version");
    expect(rowVersion?.notnull,).toBe(1,);
    expect(rowVersion?.dflt_value,).toBe("0",);

    await sql`INSERT INTO users (id, username, display_name) VALUES ('user-2', 'u2', 'U2')`.execute(db,);
    expect(raw.query("SELECT row_version FROM users WHERE id = 'user-2'",).get(),).toEqual({ row_version: 0, },);

    const sessionIdx = raw
      .query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_sessions_secret_hash'",)
      .get() as { sql: string } | undefined;

    expect(sessionIdx?.sql,).toContain("secret_hash",);
  });
});
