// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { RelationshipsService, } from "../../characters/services/relationships-service";
import { dispatchCommand, } from "../../routes/messages/command";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { getCommand, } from "./registry";
import "./interaction";

const withForcedDie = async (value: number, run: () => Promise<void>,): Promise<void> => {
  const original = crypto.getRandomValues;
  Object.defineProperty(crypto, "getRandomValues", {
    configurable: true,
    value: (array: Uint32Array,) => {
      array[0] = value - 1;
      return array;
    },
  },);
  try {
    await run();
  } finally {
    Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: original, },);
  }
};

describe("interaction commands", () => {
  test("persuade resolves against the world gate and updates NPC opinion", async () => {
    const { db, } = await createTestDb();
    const userId = "user-interaction";
    const targetActorId = "actor-target";
    const chatId = "chat-interaction";
    const worldId = "world-interaction";
    await insertUsers(db, userId, "Interaction User", { id: userId, },);
    await insertActors(db, "Interaction User", { id: userId, actor_type: "user", user_id: userId, owner_id: userId, },);
    await insertWorlds(db, userId, "Interaction World", { id: worldId, rpg_checks: 1, },);
    await insertActors(db, "Target", { id: targetActorId, },);
    await insertChats(db, "Interaction Chat", userId, { id: chatId, world_id: worldId, },);

    let body: { action?: string; actionPayload?: { outcome?: string } } | undefined;
    await withForcedDie(20, async () => {
      const result = await dispatchCommand(db, {} as never, userId, chatId, `/persuade ${targetActorId} please`,);
      if (!result.handled) { throw new Error("persuade was not handled",); }
      body = await result.response.json() as { action?: string; actionPayload?: { outcome?: string } };
    },);

    expect(body?.action,).toBe("interaction-resolved",);
    expect(body?.actionPayload?.outcome,).toBe("critical_success",);
    const relationship = await RelationshipsService(db,).getRelationship(
      targetActorId,
      userId,
      worldId,
    );
    expect(relationship,).toMatchObject({
      standing: 5,
      familiarity: 1,
      relationshipType: "neutral",
    },);
  });

  test("respects a disabled checks gate before rolling", async () => {
    const { db, } = await createTestDb();
    const userId = "user-disabled";
    const chatId = "chat-disabled";
    const worldId = "world-disabled";
    await insertUsers(db, userId, "Disabled User", { id: userId, },);
    await insertWorlds(db, userId, "Disabled World", { id: worldId, rpg_checks: 0, },);
    await insertChats(db, "Disabled Chat", userId, { id: chatId, world_id: worldId, },);

    const handler = getCommand("study",);
    const result = await handler!([], { chatId, db, userId, activeChat: { id: chatId, worldId, }, },);
    expect(result.systemMessage,).toContain("RPG not enabled",);
    const count = await db
      .selectFrom("interaction_logs",)
      .select((eb,) => eb.fn.countAll<string>().as("count",))
      .executeTakeFirstOrThrow();
    expect(Number(count.count,),).toBe(0,);
  });
});
