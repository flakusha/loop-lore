// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for group-chat turn selection gates and the @mention override.
 *
 * Non-group chats, paused chats, and chats without AI participants select
 * nobody. An @mention short-circuits strategy selection entirely, so these
 * tests never touch the TurnManager path.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ActorType, AgentType, ChatType, TurnStrategy, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { selectNextGroupActor, } from "./turn-selector";

async function seedUser(): Promise<{ db: Kysely<DB>; userId: string }> {
  const { db, } = await createTestDb();
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Owner", { id: userId, } as never,);
  return { db, userId, };
}

describe("selectNextGroupActor", () => {
  test("null for non-group chats", async () => {
    const { db, userId, } = await seedUser();
    try {
      const chatId = uid();
      await insertChats(db, "Direct", userId, { id: chatId, type: ChatType.Direct, },);
      expect(await selectNextGroupActor({ db, chatId, },),).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  test("null when paused via story_state", async () => {
    const { db, userId, } = await seedUser();
    try {
      const chatId = uid();
      await insertChats(db, "Paused", userId, {
        id: chatId,
        type: ChatType.Group,
        story_state: '{"isPaused":true}',
      },);
      const actorId = uid();
      await insertActors(db, "Luna", {
        id: actorId,
        actor_type: ActorType.Character,
        agent_type: AgentType.Ai,
      },);
      await insertChatParticipants(db, chatId, actorId,);
      expect(await selectNextGroupActor({ db, chatId, },),).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  test("null without AI participants", async () => {
    const { db, userId, } = await seedUser();
    try {
      const chatId = uid();
      await insertChats(db, "Humans", userId, { id: chatId, type: ChatType.Group, },);
      const actorId = uid();
      await insertActors(db, "Human", {
        id: actorId,
        actor_type: ActorType.User,
        agent_type: AgentType.Ai,
      },);
      await insertChatParticipants(db, chatId, actorId,);
      expect(await selectNextGroupActor({ db, chatId, },),).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  test("@mention override returns the mentioned actor", async () => {
    const { db, userId, } = await seedUser();
    try {
      const chatId = uid();
      await insertChats(db, "Party", userId, { id: chatId, type: ChatType.Group, },);
      const luna = uid();
      const max = uid();
      await insertActors(db, "Luna", {
        id: luna,
        actor_type: ActorType.Character,
        agent_type: AgentType.Ai,
      },);
      await insertActors(db, "Max", {
        id: max,
        actor_type: ActorType.Character,
        agent_type: AgentType.Ai,
      },);
      await insertChatParticipants(db, chatId, luna,);
      await insertChatParticipants(db, chatId, max,);
      expect(await selectNextGroupActor({ db, chatId, userMessage: "@Max your turn", },),).toBe(
        max,
      );
    } finally {
      await db.destroy();
    }
  });

  test("strategy path selects among AI participants", async () => {
    const { db, userId, } = await seedUser();
    try {
      const chatId = uid();
      await insertChats(db, "Strategy", userId, {
        id: chatId,
        type: ChatType.Group,
        turn_strategy: TurnStrategy.RoundRobin,
      },);
      const luna = uid();
      const max = uid();
      await insertActors(db, "Luna", {
        id: luna,
        actor_type: ActorType.Character,
        agent_type: AgentType.Ai,
      },);
      await insertActors(db, "Max", {
        id: max,
        actor_type: ActorType.Character,
        agent_type: AgentType.Ai,
      },);
      await insertChatParticipants(db, chatId, luna,);
      await insertChatParticipants(db, chatId, max,);
      const selected = await selectNextGroupActor({ db, chatId, },);
      expect([luna, max,].includes(selected ?? "",),).toBe(true,);
    } finally {
      await db.destroy();
    }
  });
});
