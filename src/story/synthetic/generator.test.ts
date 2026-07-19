/**
 * Tests for SyntheticGenerator — Phase 6 story QA scenario derivation.
 *
 * Covers: generateForChat across all types, empty chat (no source),
 * status state-machine transitions (valid/invalid), per-type case shape.
 *
 * Uses in-memory SQLite + a minimal Kysely schema. No LLM, no route wiring.
 */
import { Database } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import { SyntheticDataStatus, SyntheticDataType } from "../../db/enums";
import { createSqliteDialect, setTestDatabase } from "../../db/index";
import type { DB } from "../../db/schema";
import { jsonParseOr } from "../../utils";
import { SyntheticGenerator } from "./generator";

// Minimal schema: only the columns the generator reads/writes.
interface MinimalDB {
  chats: { id: string; name: string; world_id: string | null };
  messages: { id: string; chat_id: string; actor_id: string; role: string; content: string };
  quests: {
    id: string;
    world_id: string;
    creator_id: string;
    name: string;
    type: string;
    status: string;
    config: string;
  };
  quest_progress: { id: string; quest_id: string; chat_id: string; progress: number; status: string };
  world_states: { id: string; world_id: string; snapshot: string };
  synthetic_data: {
    id: string;
    chat_id: string | null;
    world_id: string | null;
    type: string;
    source_data: string;
    generated_cases: string;
    metadata: string;
    status: string;
    validated_at: string | null;
    validated_by: string | null;
  };
}

function createTestDb(): { sqlite: Database; db: Kysely<MinimalDB> } {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const dialect = createSqliteDialect(sqlite);
  const db = new Kysely<MinimalDB>({ dialect });

  sqlite.run(`CREATE TABLE chats (id TEXT PRIMARY KEY, name TEXT NOT NULL, world_id TEXT)`);
  sqlite.run(
    `CREATE TABLE messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, actor_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL)`,
  );
  sqlite.run(
    `CREATE TABLE quests (id TEXT PRIMARY KEY, world_id TEXT NOT NULL, creator_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, config TEXT NOT NULL)`,
  );
  sqlite.run(
    `CREATE TABLE quest_progress (id TEXT PRIMARY KEY, quest_id TEXT NOT NULL, chat_id TEXT NOT NULL, progress INTEGER NOT NULL, status TEXT NOT NULL)`,
  );
  sqlite.run(
    `CREATE TABLE world_states (id TEXT PRIMARY KEY, world_id TEXT NOT NULL, snapshot TEXT NOT NULL)`,
  );
  sqlite.run(
    `CREATE TABLE synthetic_data (
      id TEXT PRIMARY KEY, chat_id TEXT, world_id TEXT, type TEXT NOT NULL,
      source_data TEXT NOT NULL, generated_cases TEXT NOT NULL, metadata TEXT NOT NULL,
      status TEXT NOT NULL, validated_at TEXT, validated_by TEXT
    )`,
  );

  return { sqlite, db };
}

const testDb = createTestDb();
setTestDatabase(testDb.db as unknown as Kysely<DB>);

afterAll(() => {
  setTestDatabase(null);
  testDb.sqlite.close();
});

async function seedChatWithData(db: Kysely<MinimalDB>): Promise<{ chatId: string; worldId: string }> {
  const chatId = randomUUID();
  const worldId = randomUUID();
  await db.insertInto("chats").values({ id: chatId, name: "c", world_id: worldId }).execute();

  await db
    .insertInto("messages")
    .values([
      { id: randomUUID(), chat_id: chatId, actor_id: "a1", role: "user", content: "hello" },
      { id: randomUUID(), chat_id: chatId, actor_id: "a2", role: "assistant", content: "hi" },
      { id: randomUUID(), chat_id: chatId, actor_id: "a3", role: "system", content: "low quality" },
    ])
    .execute();

  const questId = randomUUID();
  await db
    .insertInto("quests")
    .values({
      id: questId,
      world_id: worldId,
      creator_id: "a1",
      name: "q",
      type: "collection",
      status: "active",
      config: "{}",
    })
    .execute();
  await db
    .insertInto("quest_progress")
    .values({ id: randomUUID(), quest_id: questId, chat_id: chatId, progress: 40, status: "active" })
    .execute();
  await db
    .insertInto("world_states")
    .values([
      { id: randomUUID(), world_id: worldId, snapshot: "{\"t\":1}" },
      { id: randomUUID(), world_id: worldId, snapshot: "{\"t\":2}" },
    ])
    .execute();

  return { chatId, worldId };
}

describe("SyntheticGenerator", () => {
  let db: Kysely<MinimalDB>;
  let gen: SyntheticGenerator;

  beforeEach(() => {
    db = testDb.db;
    gen = new SyntheticGenerator({ db: db as unknown as Kysely<DB>, maxScenarios: 5 });
  });

  test("generates one SyntheticData row per requested type", async () => {
    const { chatId } = await seedChatWithData(db);
    const ids = await gen.generateForChat(chatId, [
      SyntheticDataType.TurnSequence,
      SyntheticDataType.QuestProgression,
    ]);
    expect(ids.length).toBe(2);
  });

  test("returns empty array when chat does not exist", async () => {
    const ids = await gen.generateForChat(randomUUID());
    expect(ids.length).toBe(0);
  });

  test("produces well-formed cases with input/expected for all types", async () => {
    const { chatId } = await seedChatWithData(db);
    const ids = await gen.generateForChat(chatId);
    expect(ids.length).toBe(6);

    for (const id of ids) {
      const row = await db
        .selectFrom("synthetic_data")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe(SyntheticDataStatus.Generated);
      const cases = jsonParseOr(row.generated_cases, []) as Record<string, unknown>[];
      expect(Array.isArray(cases)).toBe(true);
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        expect(c).toHaveProperty("input");
        expect(c).toHaveProperty("expected");
        expect(c).toHaveProperty("type");
      }
    }
  });

  test("status transitions follow the state machine", async () => {
    const { chatId } = await seedChatWithData(db);
    const generated = await gen.generateForChat(chatId, [SyntheticDataType.RegenerationCase]);
    expect(generated.length).toBeGreaterThan(0);
    const id = generated[0]!;

    expect(await gen.transitionStatus(id, SyntheticDataStatus.Validated, "tester")).toBe(true);
    expect(await gen.transitionStatus(id, SyntheticDataStatus.Approved)).toBe(true);
    // approved → generated is not a valid transition
    expect(await gen.transitionStatus(id, SyntheticDataStatus.Generated)).toBe(false);

    const row = await db
      .selectFrom("synthetic_data")
      .select(["status", "validated_at", "validated_by"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe(SyntheticDataStatus.Approved);
    expect(row.validated_at).not.toBeNull();
    expect(row.validated_by).toBe("tester");
  });

  test("transitionStatus returns false for missing row", async () => {
    expect(await gen.transitionStatus(randomUUID(), SyntheticDataStatus.Validated)).toBe(false);
  });
});
