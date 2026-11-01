/**
 * Column-rename upgrade path (057_column_name_disambiguation).
 *
 * Every other migration test builds a FRESH database, which is why a branch
 * that renamed columns by rewriting already-applied migrations passed CI: fresh
 * installs re-read 001_init and see the new names, so nothing fails. The
 * databases that break are the ones that already ran the old chain.
 *
 * These tests close that gap. They migrate up to the migration BEFORE 057,
 * insert rows through the OLD column names, then apply 057 and assert that
 * each renamed column exists, that the old name is gone, and that the data
 * survived the move. `migrateToLatest()` is what a real upgrade runs.
 */
import { Database, } from "bun:sqlite";
import { afterEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createLogger, } from "../logger";
import { createSqliteDialect, setTestDatabase, } from "./index";
import type { DB, } from "./schema";

try {
  createLogger({ level: "error", },);
} catch {
  // already initialized
}

const MIGRATIONS_DIR = path.join(__dirname, "migrations",);
const MIGRATION_FILENAME = /^(\d{3})_(.+)\.ts$/;

/** The last migration that predates the rename; 057 is applied on top of it. */
const BEFORE_RENAME = "056_xp_ledger_dedupe_unique";

/** Every rename 057 performs, as `[table, oldName, newName]`. */
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

function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR,)
    .filter((f,) => MIGRATION_FILENAME.test(f,))
    .toSorted((a, b,) => a.localeCompare(b,));
}

function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const files = readdirSync(MIGRATIONS_DIR,).filter((f,) => f.endsWith(".ts",));
      const migrations: Record<string, Migration> = {};
      for (const file of files.toSorted((a, b,) => a.localeCompare(b,))) {
        const mod = await import(path.join(MIGRATIONS_DIR, file,));
        migrations[file.replace(/\.ts$/, "",)] = mod.default ?? mod;
      }

      return migrations;
    },
  };
}

function columnsOf(sqlite: Database, table: string,): string[] {
  return (sqlite.query(`PRAGMA table_info("${table}")`,).all() as { name: string }[]).map((r,) => r.name);
}

/**
 * Migrate to the pre-rename state, seed one row per renamed table through the
 * OLD column names, then apply 057 and hand back the upgraded DB.
 */
async function upgradeSeededDb() {
  const sqlite = new Database(":memory:",);
  // Kysely<any>, not a bare Kysely: the inserts below are written against
  // the PRE-rename column names, so they cannot typecheck against the current
  // DB interface — which is exactly the state this test exists to exercise.
  const db = new Kysely<any>({ dialect: createSqliteDialect(sqlite,), },);
  setTestDatabase(db as unknown as Kysely<DB>,);
  const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

  const up = await migrator.migrateTo(BEFORE_RENAME,);
  expect(up.error, "migrating to the pre-rename state should not error",).toBeUndefined();

  const userId = "user-1";
  const chatId = "chat-1";
  const messageId = "msg-1";
  const actorId = "actor-1";
  const worldId = "world-1";

  await db.insertInto("users",).values({
    id: userId,
    username: "upgrade-user",
    display_name: "Upgrade User",
    password_hash: "digest-password",
    format_version: 3,
  },).execute();

  await db.insertInto("sessions",).values({
    id: "sess-1",
    user_id: userId,
    token_hash: "digest-token",
    expires_at: "2099-01-01T00:00:00Z",
  },).execute();

  await db.insertInto("actors",).values({ id: actorId, display_name: "Upgrade Actor", format_version: 5, },).execute();
  await db.insertInto("personas",).values({
    id: "persona-1",
    user_id: userId,
    name: "Upgrade Persona",
    format_version: 7,
  },).execute();

  await db.insertInto("chats",).values({
    id: chatId,
    name: "Upgrade Chat",
    created_by: userId,
    data_version: 11,
  },).execute();

  await db.insertInto("messages",).values({
    id: messageId,
    chat_id: chatId,
    actor_id: actorId,
    role: "user",
    content: "upgrade fixture",
    format_version: 13,
    data_version: 17,
  },).execute();

  await db.insertInto("message_search_tokens",).values({
    message_id: messageId,
    token: "upgrade-term",
    scope: "all",
  },).execute();

  await db.insertInto("character_avatar_config",).values({
    id: "cac-1",
    actor_id: actorId,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    fallback_chain: '["a","b"]',
  },).execute();

  await db.insertInto("worlds",).values({
    id: worldId,
    owner_id: userId,
    name: "Upgrade World",
    data_version: 19,
  },).execute();

  await db.insertInto("assets",).values({
    id: "asset-1",
    owner_id: userId,
    filename: "upgrade.png",
    mime_type: "image/png",
    asset_type: "image",
    size_bytes: 10,
    storage_path: "/tmp/upgrade.png",
    data_version: 23,
  },).execute();

  await db.insertInto("character_stats",).values({
    id: "stats-1",
    actor_id: actorId,
    hp: 10,
    max_hp: 10,
    ac: 10,
    data_version: 29,
  },).execute();

  const applied = await migrator.migrateToLatest();
  expect(applied.error, "applying the rename migration should not error",).toBeUndefined();

  return { db, sqlite, migrator, ids: { userId, chatId, messageId, actorId, worldId, }, };
}

describe("column rename upgrade path", () => {
  // upgradeSeededDb() and the inline setup tests install the process-global
  // test override; every caller destroys its own handle, so after each test
  // the override would point at a DESTROYED database and poison every later
  // suite that resolves getDatabase()/getSqliteDatabase() in a shared
  // non-isolated run (BUG-settestdatabase-global-leak-on-test-throw). Clear it
  // per-test like migrations.test.ts — afterEach runs even when a test throws.
  afterEach(() => {
    setTestDatabase(null,);
  },);

  test("the pre-rename migration really does use the old column names", async () => {
    // Guards the premise of every assertion below: if 056 already carried the
    // new names, this file would pass while testing nothing.
    const sqlite = new Database(":memory:",);
    // Kysely<DB> (not the bare Kysely<unknown> inference): this premise test
    // issues no typed query — it migrates and then reads columns off the raw
    // sqlite handle — so the DB interface is the right one to install as the
    // test override, with no cast.
    const db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    setTestDatabase(db,);
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

    const up = await migrator.migrateTo(BEFORE_RENAME,);
    expect(up.error,).toBeUndefined();

    for (const [table, oldName,] of RENAMES) {
      expect(columnsOf(sqlite, table,), `${table} should have ${oldName} before the rename`,).toContain(oldName,);
    }

    const names = migrationNames();
    expect(names,).toContain("057_column_name_disambiguation.ts",);
    expect(names[names.indexOf("057_column_name_disambiguation.ts",) - 1],).toBe(BEFORE_RENAME + ".ts",);
    await db.destroy();
    sqlite.close();
  });

  test("every renamed column exists under its new name after upgrading", async () => {
    const { db, sqlite, } = await upgradeSeededDb();
    for (const [table, oldName, newName,] of RENAMES) {
      const cols = columnsOf(sqlite, table,);
      expect(cols, `${table}.${newName} should exist after the rename`,).toContain(newName,);
      expect(cols, `${table}.${oldName} should be gone after the rename`,).not.toContain(oldName,);
    }

    await db.destroy();
    sqlite.close();
  });

  test("row data survives the rename", async () => {
    const { db, sqlite, ids, } = await upgradeSeededDb();

    const users = sqlite.query("SELECT secret_hash, row_version FROM users WHERE id = ?",).get(ids.userId,);
    expect(users,).toEqual({ secret_hash: "digest-password", row_version: 3, },);

    const sessions = sqlite.query("SELECT secret_hash FROM sessions WHERE id = 'sess-1'",).get();
    expect(sessions,).toEqual({ secret_hash: "digest-token", },);

    const actors = sqlite.query("SELECT row_version FROM actors WHERE id = ?",).get(ids.actorId,);
    expect(actors,).toEqual({ row_version: 5, },);

    const personas = sqlite.query("SELECT row_version FROM personas WHERE id = 'persona-1'",).get();
    expect(personas,).toEqual({ row_version: 7, },);

    const messages = sqlite.query(
      "SELECT row_version, content_version FROM messages WHERE id = ?",
    ).get(ids.messageId,);

    expect(messages,).toEqual({ row_version: 13, content_version: 17, },);

    const tokens = sqlite.query("SELECT term FROM message_search_tokens WHERE message_id = ?",).get(ids.messageId,);
    expect(tokens,).toEqual({ term: "upgrade-term", },);

    const avatarCfg = sqlite.query("SELECT fallback_order FROM character_avatar_config WHERE id = 'cac-1'",).get();
    expect(avatarCfg,).toEqual({ fallback_order: '["a","b"]', },);

    const assets = sqlite.query("SELECT content_version FROM assets WHERE id = 'asset-1'",).get();
    expect(assets,).toEqual({ content_version: 23, },);

    const stats = sqlite.query("SELECT content_version, record_hash FROM character_stats WHERE id = 'stats-1'",).get();
    expect(stats,).toEqual({ content_version: 29, record_hash: "", },);

    await db.destroy();
    sqlite.close();
  });

  test("the composite primary key on message_search_tokens follows the rename", async () => {
    const { db, sqlite, ids, } = await upgradeSeededDb();
    const ddl = sqlite.query(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='message_search_tokens'",
    ).get() as { sql: string };

    expect(ddl.sql, "PK should reference the new column name",).toContain("term",);
    expect(ddl.sql, "PK should no longer reference the old column name",).not.toContain("token)",);

    // The PK must still reject a duplicate (message_id, term).
    expect(() => {
      sqlite
        .query("INSERT INTO message_search_tokens (message_id, term, scope) VALUES (?, ?, ?)",)
        .run(ids.messageId, "upgrade-term", "all",);
    },).toThrow(/UNIQUE|PRIMARY KEY/i,);

    await db.destroy();
    sqlite.close();
  });

  test("NOT NULL and DEFAULT constraints survive the rename", async () => {
    const { db, sqlite, } = await upgradeSeededDb();
    const info = sqlite.query(`PRAGMA table_info("users")`,).all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];

    const rowVersion = info.find((c,) => c.name === "row_version");
    expect(rowVersion?.notnull, "row_version should still be NOT NULL",).toBe(1,);
    expect(rowVersion?.dflt_value, "row_version should keep its DEFAULT",).toBe("0",);

    // A user insert that omits row_version must fall back to the default,
    // proving the constraint is live rather than merely recorded.
    sqlite
      .query(
        "INSERT INTO users (id, username, display_name) VALUES ('user-2','u2','U2')",
      )
      .run();

    const inserted = sqlite.query("SELECT row_version FROM users WHERE id = 'user-2'",).get();
    expect(inserted,).toEqual({ row_version: 0, },);
    await db.destroy();
    sqlite.close();
  });

  test("the rename is reversible: down restores the old column names", async () => {
    const { db, sqlite, migrator, } = await upgradeSeededDb();
    // migrateTo(BEFORE_RENAME) rolls back every migration above 056 — including
    // 057 itself — regardless of how many newer migrations exist. migrateDown()
    // only rolls back the tail, which is no longer 057 once 059-063 land.
    const down = await migrator.migrateTo(BEFORE_RENAME,);
    expect(down.error, "rolling back to pre-rename should not error",).toBeUndefined();

    for (const [table, oldName,] of RENAMES) {
      const cols = columnsOf(sqlite, table,);
      expect(cols, `${table}.${oldName} should be back after down`,).toContain(oldName,);
    }

    expect(columnsOf(sqlite, "character_stats",),).not.toContain("record_hash",);
    await db.destroy();
    sqlite.close();
  });

  test("an upgraded database matches a fresh install column-for-column", async () => {
    // The strongest statement of the whole rework: replaying the chain from the
    // pre-rename state must land on exactly the schema a fresh install gets.
    // Comparing column name/type/notnull/default/pk (order-independent) catches
    // any rename that silently dropped a constraint the fresh path would have.
    const shapeOf = (sqlite: Database,) => {
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'kysely_%'",)
        .all() as { name: string }[];

      const shape: Record<string, string[]> = {};
      for (const { name, } of tables) {
        const cols = sqlite.query(`PRAGMA table_info("${name}")`,).all() as {
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }[];

        shape[name] = cols
          .map((c,) => `${c.name}:${c.type}:notnull=${c.notnull}:dflt=${c.dflt_value}:pk=${c.pk}`)
          .toSorted();
      }

      return shape;
    };

    // Fresh install: whole chain in one go.
    const freshSqlite = new Database(":memory:",);
    const freshDb = new Kysely<any>({ dialect: createSqliteDialect(freshSqlite,), },);
    setTestDatabase(freshDb as unknown as Kysely<DB>,);
    const freshUp = await new Migrator({ db: freshDb, provider: buildMigrationProvider(), },).migrateToLatest();
    expect(freshUp.error,).toBeUndefined();
    const freshShape = shapeOf(freshSqlite,);
    await freshDb.destroy();
    freshSqlite.close();

    const { db, sqlite, } = await upgradeSeededDb();
    const upgradedShape = shapeOf(sqlite,);

    expect(Object.keys(upgradedShape,).toSorted(), "same set of tables",).toEqual(
      Object.keys(freshShape,).toSorted(),
    );

    for (const [table, cols,] of Object.entries(freshShape,)) {
      expect(upgradedShape[table], `${table} column shape after upgrade`,).toEqual(cols,);
    }

    await db.destroy();
    sqlite.close();
  });

  test("no old column name survives anywhere in the upgraded schema", async () => {
    // Belt-and-braces over the per-table loop above: a leftover reference in an
    // index, trigger or view definition would not show up in PRAGMA table_info
    // but would still break the application against an upgraded database.
    const { db, sqlite, } = await upgradeSeededDb();
    const ddl = sqlite.query(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL",
    ).all() as { sql: string }[];

    const old = [
      "format_version",
      "password_hash",
      "token_hash",
      "data_version",
      "fallback_chain",
    ];

    for (const name of old) {
      const hits = ddl.filter((d,) => d.sql.includes(name,));
      expect(hits.map((h,) => h.sql.slice(0, 80,)), `no DDL still references ${name}`,).toEqual([],);
    }

    await db.destroy();
    sqlite.close();
  });

  test("no orphaned references remain in indexes or foreign keys", async () => {
    const { db, sqlite, } = await upgradeSeededDb();
    const objects = sqlite.query(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND sql LIKE '%' || ? || '%'",
    ).all("format_version",) as { sql: string }[];

    expect(objects.filter((o,) => o.sql.includes("format_version",)),).toHaveLength(0,);

    expect(sqlite.query("PRAGMA foreign_key_check",).all(), "FK integrity should hold",).toHaveLength(0,);

    const sessionIdx = sqlite
      .query("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_sessions_secret_hash'",)
      .get() as { sql: string } | null;

    expect(sessionIdx?.sql, "the sessions index should track the new column name",).toContain(
      "secret_hash",
    );

    await db.destroy();
    sqlite.close();
  });
});
