// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { InteractionOutcome, } from "../../db/enums";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertCharacterStats, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { getRecentInteractions, resolveInteraction, } from "./service";

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

describe("interaction service", () => {
  test("persists the shared roll inputs, outcome, and state changes", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User 1", { id: "user-1", },);
    await insertActors(db, "Actor 1", { id: "actor-1", user_id: "user-1", owner_id: "user-1", },);
    await insertChats(db, "Chat 1", "user-1", { id: "chat-1", },);
    await insertCharacterStats(db, "actor-1", 10, 10, 10, { int: 18, },);
    let resolution: Awaited<ReturnType<typeof resolveInteraction>> | undefined;
    await withForcedDie(20, async () => {
      resolution = await resolveInteraction(db, {
        command: "study",
        category: "intellect",
        actorId: "actor-1",
        chatId: "chat-1",
        skill: "intellect",
        difficulty: 10,
        modifiers: [{ source: "equipment", value: 2, },],
        stateChange: () => ({ insight: 1, }),
      },);
    },);

    expect(resolution?.outcome,).toBe(InteractionOutcome.CriticalSuccess,);
    const row = await db
      .selectFrom("interaction_logs",)
      .select([
        "roll_raw_total",
        "roll_total",
        "roll_margin",
        "roll_values",
        "state_changes",
        "outcome",
      ],)
      .where("chat_id", "=", "chat-1",)
      .executeTakeFirstOrThrow();
    expect(row.roll_raw_total,).toBe(20,);
    expect(row.roll_total,).toBe(26,);
    expect(row.roll_margin,).toBe(16,);
    expect(row.roll_values,).toBe("[20]",);
    expect(row.state_changes,).toBe('{"insight":1}',);
    expect(row.outcome,).toBe("critical_success",);

    const recent = await getRecentInteractions(db, { chatId: "chat-1", },);
    expect(recent[0]?.advantage,).toBe("normal",);
    expect(recent[0]?.modifiers,).toEqual([
      { source: "ability.int", value: 4, },
      { source: "equipment", value: 2, },
    ],);
    expect(recent[0]?.stateChanges,).toEqual({ insight: 1, },);
  });

  test("blocks and persists interactions with missing materials", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User 1", { id: "user-1", },);
    await insertActors(db, "Actor 1", { id: "actor-1", user_id: "user-1", owner_id: "user-1", },);
    await insertChats(db, "Chat 1", "user-1", { id: "chat-1", },);
    const resolution = await resolveInteraction(db, {
      command: "craft",
      category: "economy",
      actorId: "actor-1",
      chatId: "chat-1",
      skill: "intellect",
      difficulty: 10,
      requirements: [{ itemName: "rope", quantity: 1, },],
    },);
    expect(resolution.outcome,).toBe(InteractionOutcome.Blocked,);
    expect(resolution.id,).not.toBeNull();
    const row = await db
      .selectFrom("interaction_logs",)
      .select(["outcome", "roll_total", "result",],)
      .where("chat_id", "=", "chat-1",)
      .executeTakeFirstOrThrow();
    expect(row.outcome,).toBe(InteractionOutcome.Blocked,);
    expect(row.roll_total,).toBeNull();
    expect(row.result,).toContain("rope x1",);
  });

  test("records natural-one critical failures", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User 1", { id: "user-1", },);
    await insertActors(db, "Actor 1", { id: "actor-1", user_id: "user-1", owner_id: "user-1", },);
    await insertChats(db, "Chat 1", "user-1", { id: "chat-1", },);
    let resolution: Awaited<ReturnType<typeof resolveInteraction>> | undefined;
    await withForcedDie(1, async () => {
      resolution = await resolveInteraction(db, {
        command: "hide",
        category: "stealth",
        actorId: "actor-1",
        chatId: "chat-1",
        skill: "stealth",
        difficulty: 10,
      },);
    },);
    expect(resolution?.outcome,).toBe(InteractionOutcome.CriticalFailure,);
    expect(resolution?.margin,).toBe(-9,);
  });
});
