// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `applyContextCut`
 * (src/routes/messages/scene-transition-context-cut.ts).
 *
 * Contract: visible chat history over the chat's token budget is promoted
 * to actor memories; promotion failures (e.g. non-participant actor) are
 * swallowed and the cut still completes without throwing.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { applyContextCut, } from "./scene-transition-context-cut";

describe("applyContextCut", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  const chatId = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, "cut-user", "Cut User", { id: userId, } as never,);
    await insertActors(db, "Cutter", { id: actorId, owner_id: userId, } as never,);
    await insertActors(db, "Outsider", { id: outsiderId, owner_id: userId, } as never,);
    // Tiny budget so the long messages below overflow immediately.
    await insertChats(db, "Cut Chat", userId, {
      id: chatId,
      context_max_tokens: 5,
    } as never,);
    await insertChatParticipants(db, chatId, actorId, {},);

    // Long content (>200 chars) scores high enough for promotion.
    const long = "discovery ".repeat(30,);
    await insertMessages(db, chatId, actorId, "user", long, {} as never,);
    await insertMessages(db, chatId, actorId, "assistant", long, {} as never,);
    // Hidden messages are excluded from promotion candidates.
    await insertMessages(db, chatId, actorId, "user", long, {
      visibility: "hidden",
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("promotes overflow history into actor memories", async () => {
    await applyContextCut(db, chatId, actorId, "chapter two begins", "regex",);

    const memories = await db
      .selectFrom("actor_memories",).selectAll()
      .where("source_chat_id", "=", chatId,)
      .execute();
    expect(memories.length,).toBeGreaterThan(0,);
  });

  test("non-participant actor degrades to empty promotion without throwing", async () => {
    const before = await db
      .selectFrom("actor_memories",).selectAll()
      .where("source_chat_id", "=", chatId,).execute();

    // outsider is not a chat participant → ownership guard throws inside
    // the try-block → caught, warned, promotion skipped, no throw outward.
    await applyContextCut(db, chatId, outsiderId, "another cut", "aux-llm",);

    const after = await db
      .selectFrom("actor_memories",).selectAll()
      .where("source_chat_id", "=", chatId,).execute();
    expect(after,).toHaveLength(before.length,);
  });

  test("unknown chat completes with no memories", async () => {
    await applyContextCut(db, "no-such-chat", actorId, "ghost cut", "regex",);

    const memories = await db
      .selectFrom("actor_memories",).selectAll()
      .where("source_chat_id", "=", "no-such-chat",).execute();
    expect(memories,).toHaveLength(0,);
  });
});
