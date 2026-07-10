import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely, SqliteDialect } from "kysely";
import { up, down } from "./migrations/001_init";

// Inlined dialect factory — intentionally NOT imported from ./index so this
// test does not surface the latent `Database`/`Kysely<DB>` shadow
// typing wart tracked as future strictness work (see src/db/index.ts).
interface BunSqliteStatement {
  reader: boolean;
  all(parameters: readonly unknown[]): unknown[];
  run(parameters: readonly unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  iterate(parameters: readonly unknown[]): IterableIterator<unknown>;
}
interface BunSqliteWrapper {
  close(): void;
  prepare(sql: string): BunSqliteStatement;
}
function createMemoryDialect(database: Database): SqliteDialect {
  const wrapped: BunSqliteWrapper = {
    close() {
      database.close();
    },
    prepare: (sql: string) => {
      const statement = database.prepare(sql);
      return {
        get reader() {
          const s = sql.trim().toUpperCase();
          return s.startsWith("SELECT") || s.startsWith("WITH") || s.startsWith("PRAGMA");
        },
        all: (parameters: readonly unknown[]) => statement.all(...(parameters as any[])),
        run: (parameters: readonly unknown[]) => statement.run(...(parameters as any[])),
        iterate: function* (parameters: readonly unknown[]) {
          yield* statement.all(...(parameters as any[]));
        },
      };
    },
  };
  return new SqliteDialect({ database: wrapped });
}

/** Schema tables created by the split `001_init` orchestrator (excludes kysely_migration). */
const EXPECTED_TABLES = [
  "users",
  "sessions",
  "worlds",
  "locations",
  "items",
  "world_items",
  "chats",
  "actors",
  "chat_participants",
  "characters",
  "actor_memories",
  "actor_notes",
  "actor_items",
  "actor_lore_entries",
  "world_lore_entries",
  "assets",
  "asset_links",
  "messages",
  "actor_keys",
  "user_api_keys",
  "generation_attempts",
  "story_turns",
  "quests",
  "quest_progress",
  "world_states",
  "npc_states",
  "location_states",
  "synthetic_data",
] as const;

function schemaTables(db: Database): Set<string> {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'kysely_migration'")
    .all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

describe("migrations round-trip (split 001_init)", () => {
  let db: Database;
  let kysely: Kysely<unknown>;

  beforeAll(() => {
    db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    kysely = new Kysely({ dialect: createMemoryDialect(db) });
  });

  afterAll(() => {
    void kysely.destroy();
  });

  test("up() creates every expected schema table", async () => {
    await up(kysely);
    const names = schemaTables(db);
    for (const table of EXPECTED_TABLES) {
      expect(names.has(table), `missing table: ${table}`).toBe(true);
    }
    expect(names.size, "unexpected extra tables present").toBe(EXPECTED_TABLES.length);
  });

  test("down() drops every schema table (clean revert)", async () => {
    await down(kysely);
    const names = schemaTables(db);
    expect(names.size, `tables still present: ${[...names].join(", ")}`).toBe(0);
  });
});
