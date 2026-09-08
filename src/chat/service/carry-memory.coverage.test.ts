// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `carryMemory` (src/chat/service/carry-memory.ts).
 *
 * Contract: actor_memories rows whose source_chat_id points at the source
 * chat are copied with a fresh id and the new chat id; memories of other
 * chats are untouched; empty source chat is a no-op.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { carryMemory, } from "./carry-memory";

describe("carryMemory", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const sourceChatId = crypto.randomUUID();
  const targetChatId = crypto.randomUUID();
  const otherChatId = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, "carry-mem-user", "Carry User", { id: userId, } as never,);
    await insertActors(db, "Carry Actor", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await insertChats(db, "Source", userId, { id: sourceChatId, } as never,);
    await insertChats(db, "Target", userId, { id: targetChatId, } as never,);
    await insertChats(db, "Other", userId, { id: otherChatId, } as never,);

    await insertActorMemories(db, actorId, "source memory one", {
      id: "mem-src-1",
      source_chat_id: sourceChatId,
      importance: 5,
    } as never,);
    await insertActorMemories(db, actorId, "source memory two", {
      id: "mem-src-2",
      source_chat_id: sourceChatId,
      importance: 2,
    } as never,);
    await insertActorMemories(db, actorId, "unrelated memory", {
      id: "mem-other-1",
      source_chat_id: otherChatId,
      importance: 1,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("copies all source-chat memories into the target chat with fresh ids", async () => {
    await carryMemory(db, sourceChatId, targetChatId,);

    const copied = await db
      .selectFrom("actor_memories",)
      .selectAll()
      .where("source_chat_id", "=", targetChatId,)
      .execute();
    expect(copied,).toHaveLength(2,);
    expect(copied.map((m,) => m.content).sort(),).toEqual(["source memory one", "source memory two",],);
    // Fresh ids — no id collision with the originals.
    expect(copied.map((m,) => m.id),).not.toContain("mem-src-1",);
    expect(copied.map((m,) => m.id),).not.toContain("mem-src-2",);
    // Field fidelity on the first copy.
    const one = copied.find((m,) => m.content === "source memory one");
    expect(one?.actor_id,).toBe(actorId,);
    expect(one?.importance,).toBe(5,);
  });

  test("leaves source and unrelated chat memories untouched", async () => {
    const source = await db
      .selectFrom("actor_memories",)
      .selectAll()
      .where("source_chat_id", "=", sourceChatId,)
      .execute();
    expect(source,).toHaveLength(2,);
    expect(source.map((m,) => m.id).sort(),).toEqual(["mem-src-1", "mem-src-2",],);

    const other = await db
      .selectFrom("actor_memories",)
      .selectAll()
      .where("source_chat_id", "=", otherChatId,)
      .execute();
    expect(other,).toHaveLength(1,);
  });

  test("no-op when the source chat has no memories", async () => {
    const emptyChatId = crypto.randomUUID();
    await insertChats(db, "Empty", userId, { id: emptyChatId, } as never,);

    await carryMemory(db, emptyChatId, targetChatId,);

    const still = await db
      .selectFrom("actor_memories",)
      .selectAll()
      .where("source_chat_id", "=", targetChatId,)
      .execute();
    expect(still,).toHaveLength(2,);
  });
});
