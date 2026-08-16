/**
 * Tests for SyntheticGenerator — Phase 6 story QA scenario derivation.
 *
 * Covers: generateForChat across all types, empty chat (no source),
 * status state-machine transitions (valid/invalid), per-type case shape.
 *
 * Uses in-memory SQLite + Kysely test DB. No LLM, no route wiring.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { SyntheticDataStatus, SyntheticDataType, } from "../../db/enums";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { jsonParseOr, } from "../../utils";
import { SyntheticGenerator, } from "./generator";

let testEnv: { db: Kysely<DB>; sqlite: import("bun:sqlite").Database };

beforeAll(async () => {
  testEnv = await createTestDb();
  // Disable FKs — original test used minimal schema without FK constraints
  testEnv.sqlite.run("PRAGMA foreign_keys = OFF",);
  setTestDatabase(testEnv.db,);
},);

afterAll(() => {
  setTestDatabase(null,);
  testEnv.sqlite.close();
},);

async function seedChatWithData(db: Kysely<DB>,): Promise<{ chatId: string; worldId: string }> {
  const chatId = randomUUID();
  const worldId = randomUUID();

  await db.insertInto("chats",).values({ id: chatId, name: "c", world_id: worldId, created_by: "user-1", },)
    .execute();

  await db
    .insertInto("messages",)
    .values([
      {
        id: randomUUID(),
        chat_id: chatId,
        actor_id: "a1",
        role: "user",
        content: "hello",
        content_type: "text",
        content_format: "markdown",
        content_encoding: "identity",
        status: "confirmed",
        visibility: "visible",
      } as never,
      {
        id: randomUUID(),
        chat_id: chatId,
        actor_id: "a2",
        role: "assistant",
        content: "hi",
        content_type: "text",
        content_format: "markdown",
        content_encoding: "identity",
        status: "confirmed",
        visibility: "visible",
      } as never,
      {
        id: randomUUID(),
        chat_id: chatId,
        actor_id: "a3",
        role: "system",
        content: "low quality",
        content_type: "text",
        content_format: "markdown",
        content_encoding: "identity",
        status: "confirmed",
        visibility: "visible",
      } as never,
    ],)
    .execute();

  const questId = randomUUID();
  await db
    .insertInto("quests",)
    .values({
      id: questId,
      world_id: worldId,
      creator_id: "a1",
      name: "q",
      type: "collection",
      status: "active",
      config: "{}",
      target: 0,
    } as never,)
    .execute();
  await db
    .insertInto("quest_progress",)
    .values({ id: randomUUID(), quest_id: questId, chat_id: chatId, progress: 40, status: "active", } as never,)
    .execute();
  await db
    .insertInto("world_states",)
    .values([
      { id: randomUUID(), world_id: worldId, snapshot: '{"t":1}', },
      { id: randomUUID(), world_id: worldId, snapshot: '{"t":2}', },
    ],)
    .execute();

  return { chatId, worldId, };
}

describe("SyntheticGenerator", () => {
  let db: Kysely<DB>;
  let gen: SyntheticGenerator;

  beforeEach(() => {
    db = testEnv.db;
    gen = new SyntheticGenerator({ db, maxScenarios: 5, },);
  },);

  test("generates one SyntheticData row per requested type", async () => {
    const { chatId, } = await seedChatWithData(db,);
    const ids = await gen.generateForChat(chatId, [
      SyntheticDataType.TurnSequence,
      SyntheticDataType.QuestProgression,
    ],);
    expect(ids.length,).toBe(2,);
  });

  test("returns empty array when chat does not exist", async () => {
    const ids = await gen.generateForChat(randomUUID(),);
    expect(ids.length,).toBe(0,);
  });

  test("produces well-formed cases with input/expected for all types", async () => {
    const { chatId, } = await seedChatWithData(db,);
    const ids = await gen.generateForChat(chatId,);
    expect(ids.length,).toBe(6,);

    for (const id of ids) {
      const row = await db
        .selectFrom("synthetic_data",)
        .selectAll()
        .where("id", "=", id,)
        .executeTakeFirstOrThrow();
      expect(row.status,).toBe(SyntheticDataStatus.Generated,);
      const cases = jsonParseOr(row.generated_cases, [],) as Record<string, unknown>[];
      expect(Array.isArray(cases,),).toBe(true,);
      expect(cases.length,).toBeGreaterThan(0,);
      for (const c of cases) {
        expect(c,).toHaveProperty("input",);
        expect(c,).toHaveProperty("expected",);
        expect(c,).toHaveProperty("type",);
      }
    }
  });

  test("status transitions follow the state machine", async () => {
    const { chatId, } = await seedChatWithData(db,);
    const generated = await gen.generateForChat(chatId, [SyntheticDataType.RegenerationCase,],);
    expect(generated.length,).toBeGreaterThan(0,);
    const id = generated[0]!;

    expect(await gen.transitionStatus(id, SyntheticDataStatus.Validated, "tester",),).toBe(true,);
    expect(await gen.transitionStatus(id, SyntheticDataStatus.Approved,),).toBe(true,);
    // approved → generated is not a valid transition
    expect(await gen.transitionStatus(id, SyntheticDataStatus.Generated,),).toBe(false,);

    const row = await db
      .selectFrom("synthetic_data",)
      .select(["status", "validated_at", "validated_by",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();
    expect(row.status,).toBe(SyntheticDataStatus.Approved,);
    expect(row.validated_at,).not.toBeNull();
    expect(row.validated_by,).toBe("tester",);
  });

  test("transitionStatus returns false for missing row", async () => {
    expect(await gen.transitionStatus(randomUUID(), SyntheticDataStatus.Validated,),).toBe(false,);
  });
});
