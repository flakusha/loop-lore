/**
 * Tests for storeNpcMovement (src/generation/auto-gen/store-npc-movement.ts).
 *
 * Pins the non-fatal producer boundary: a location_change narration persists
 * a movement event on the message's metadata, ordinary narration writes
 * nothing, and a storage failure is swallowed (never thrown into the
 * generation path).
 *
 * Parallel-safe: fresh in-memory DB per test, unique ids.
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { storeNpcMovement, } from "./store-npc-movement";

// The failure path logs via the module logger, which throws before init —
// create a quiet one up front.
beforeAll(() => {
  createLogger({ level: "error", },);
},);

/** Minimal config: regex-only classification (no AUX LLM configured). */
function makeConfig(): Parameters<typeof storeNpcMovement>[0]["config"] {
  return {
    generation: { defaultProvider: "mock-provider", },
  } as Parameters<typeof storeNpcMovement>[0]["config"];
}

describe("storeNpcMovement", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeEach(async () => {
    const created = await createTestDb();
    db = created.db;
    sqlite = created.sqlite;
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  async function seedChat(chatId: string,): Promise<string> {
    const userId = await insertUsers(db, `u-${chatId}`, "User", { id: `user-${chatId}`, },);
    await insertActors(db, "Actor", { id: `actor-${chatId}`, user_id: userId, },);
    await insertChats(db, "Chat", userId, { id: chatId, },);
    return insertMessages(
      db,
      chatId,
      `actor-${chatId}`,
      MessageRole.Assistant,
      "narration",
      { id: `msg-${chatId}`, parent_id: null, swipe_index: null, },
    );
  }

  test("persists a movement event when narration signals a location change", async () => {
    const messageId = await seedChat("chat-mv",);

    await storeNpcMovement({
      database: db,
      config: makeConfig(),
      chatId: "chat-mv",
      actorId: "actor-chat-mv",
      messageId,
      content: "I walk to the tavern",
    },);

    const row = await db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", messageId,)
      .executeTakeFirstOrThrow();

    const metadata = JSON.parse(row.metadata ?? "{}",) as {
      movement?: Array<{ actorId: string; fromLocationId: string; toLocationId: string; pattern: string }>;
    };

    expect(metadata.movement,).toHaveLength(1,);
    expect(metadata.movement![0]!.actorId,).toBe("actor-chat-mv",);
    expect(metadata.movement![0]!.toLocationId,).toBe("the tavern",);
    expect(metadata.movement![0]!.pattern,).toBe("regex",);
  });

  test("ordinary narration writes no movement event", async () => {
    const messageId = await seedChat("chat-plain",);

    await storeNpcMovement({
      database: db,
      config: makeConfig(),
      chatId: "chat-plain",
      actorId: "actor-chat-plain",
      messageId,
      content: "the cat sat the cat sat the cat sat and more",
    },);

    const row = await db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", messageId,)
      .executeTakeFirstOrThrow();

    const metadata = JSON.parse(row.metadata ?? "{}",) as { movement?: unknown };
    expect(metadata.movement,).toBeUndefined();
  });

  test("storage failure is swallowed, never thrown into the generation path", async () => {
    const messageId = await seedChat("chat-fail",);
    // Abort the metadata UPDATE that storeMovementEvents performs —
    // simulating a storage-layer failure.
    sqlite.run(
      `CREATE TRIGGER npc_movement_fail BEFORE UPDATE ON messages WHEN NEW.metadata LIKE '%"movement"%' BEGIN SELECT RAISE(ABORT, 'npc-movement fail'); END`,
    );

    try {
      await storeNpcMovement({
        database: db,
        config: makeConfig(),
        chatId: "chat-fail",
        actorId: "actor-chat-fail",
        messageId,
        content: "I walk to the tavern",
      },);

      const row = await db
        .selectFrom("messages",)
        .selectAll()
        .where("id", "=", messageId,)
        .executeTakeFirstOrThrow();

      const metadata = JSON.parse(row.metadata ?? "{}",) as { movement?: unknown };
      expect(metadata.movement,).toBeUndefined();
    } finally {
      sqlite.run("DROP TRIGGER npc_movement_fail",);
    }
  });
});
