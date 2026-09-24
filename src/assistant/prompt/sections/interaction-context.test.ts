// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { interactionContextSection, } from "./interaction-context";

describe("interaction prompt context", () => {
  test("surfaces recent resolved interactions and state changes", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User 1", { id: "user-1", },);
    await insertActors(db, "Actor 1", { id: "actor-1", user_id: "user-1", owner_id: "user-1", },);
    await insertChats(db, "Chat 1", "user-1", { id: "chat-1", },);
    await db
      .insertInto("interaction_logs",)
      .values({
        id: "interaction-1",
        chat_id: "chat-1",
        actor_id: "actor-1",
        command: "persuade",
        category: "social",
        skill: "charisma",
        difficulty: 12,
        roll_sides: 20,
        roll_raw_total: 20,
        roll_total: 20,
        roll_margin: 8,
        outcome: "critical_success",
        modifiers: '[{"source":"ability.cha","value":2}]',
        state_changes: '{"npcOpinion":{"favor":5}}',
      },)
      .execute();

    const messages = await interactionContextSection.build({
      db,
      chat: { id: "chat-1", },
    } as AssembleContext,);

    expect(messages,).toHaveLength(1,);
    expect(messages[0]?.content,).toContain("advantage normal; modifiers ability.cha +2",);
    expect(messages[0]?.content,).toContain('"favor":5',);
  });
});
