// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * T2 multi-assistant / multi-LLM chat rows (spike EXTEND direction).
 *
 * 1. Direct multi-LLM rotation (variant 6): two consecutive resolveActor
 *    calls with a stored message between them yield the OTHER actor.
 * 2. Regression: single-participant direct chat resolves the same actor,
 *    never a cascade.
 * Uses in-memory SQLite via createTestDb(); colocated with resolve-actor.
 */
import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { resolveActor, } from "./resolve-actor";

describe("resolveActor direct multi-LLM rotation (T2)", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const created = await createTestDb();
    db = created.db;
  },);

  afterAll(async () => {
    await db?.destroy();
  },);

  async function seedDirectChat(
    actorNames: string[],
  ): Promise<{ chatId: string; userId: string; actorIds: string[] }> {
    const userId = uid();
    await insertUsers(db, `user-${userId}`, "User", { id: userId, },);
    const chatId = await insertChats(db, "Direct chat", userId, {
      id: uid(),
      type: "direct",
      mode: "battle",
    },);

    const actorIds: string[] = [];
    for (const name of actorNames) {
      const actorId = uid();
      await insertActors(db, name, {
        id: actorId,
        actor_type: "character",
        agent_type: "ai",
        display_name: name,
      } as never,);

      await insertChatParticipants(db, chatId, actorId,);
      actorIds.push(actorId,);
    }

    return { chatId, userId, actorIds, };
  }

  test("two consecutive resolves yield different actors", async () => {
    const { chatId, userId, actorIds, } = await seedDirectChat(["Bravo", "Alpha",],);
    const first = await resolveActor(db, { type: "direct", chatId, userId, },);
    expect(first,).not.toBeNull();
    // Deterministic order: display_name ASC -> Alpha first.
    expect(first!.characterName,).toBe("Alpha",);
    await insertMessages(db, chatId, first!.characterId, MessageRole.Assistant, "Alpha speaks",);
    const second = await resolveActor(db, { type: "direct", chatId, userId, },);
    expect(second,).not.toBeNull();
    expect(second!.characterId,).not.toBe(first!.characterId,);
    expect(actorIds,).toContain(second!.characterId,);
  });

  test("single participant resolves stably, no rotation", async () => {
    const { chatId, userId, } = await seedDirectChat(["Solo",],);
    const first = await resolveActor(db, { type: "direct", chatId, userId, },);
    expect(first?.characterName,).toBe("Solo",);
    await insertMessages(db, chatId, first!.characterId, MessageRole.Assistant, "Solo speaks",);
    const second = await resolveActor(db, { type: "direct", chatId, userId, },);
    expect(second?.characterId,).toBe(first?.characterId,);
  });
});
