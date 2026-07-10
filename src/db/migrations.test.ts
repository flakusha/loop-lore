import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { createSqliteDialect } from "./index";
import { up, down } from "./migrations/001_init";

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
    kysely = new Kysely({ dialect: createSqliteDialect(db) });
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
