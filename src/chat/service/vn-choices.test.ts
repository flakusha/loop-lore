/**
 * Tests for VN choice card service (C7 Phase 4).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { listVnChoices, selectVnChoice, } from "./vn-choices";

describe("VN choice card service (C7 Phase 4)", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let chatId: string;
  const missingChatId = "missing-chat";
  const missingChoiceId = "missing-choice";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = crypto.randomUUID();
    chatId = crypto.randomUUID();

    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);

    // Direct insert so we control the ID (insertChats ignores opts.id)
    await db.insertInto("chats",).values({
      id: chatId,
      name: "VN Chat",
      type: "direct" as const,
      mode: "group" as const,
      created_by: ownerId,
      visual_novel: 1,
    },).execute();

    // Scene 0 — two available choices
    await db.insertInto("vn_choices",).values({
      id: "choice-forest",
      chat_id: chatId,
      scene_index: 0,
      label: "Enter the Forest",
      description: "A dark and mysterious forest awaits.",
      consequences: JSON.stringify({ location: "forest-path", },),
      relationship_impact: JSON.stringify({},),
      mood_impact: JSON.stringify({},),
      unlock_conditions: JSON.stringify({},),
      status: "available",
      created_at: new Date().toISOString(),
    },).execute();

    await db.insertInto("vn_choices",).values({
      id: "choice-cave",
      chat_id: chatId,
      scene_index: 0,
      label: "Enter the Cave",
      description: "A damp and echoing cave.",
      consequences: JSON.stringify({},),
      relationship_impact: JSON.stringify({},),
      mood_impact: JSON.stringify({},),
      unlock_conditions: JSON.stringify({},),
      status: "available",
      created_at: new Date().toISOString(),
    },).execute();

    // Scene 1 — one selected + one available
    await db.insertInto("vn_choices",).values({
      id: "choice-tower-pre",
      chat_id: chatId,
      scene_index: 1,
      label: "Already chosen",
      description: null,
      consequences: JSON.stringify({},),
      relationship_impact: JSON.stringify({},),
      mood_impact: JSON.stringify({},),
      unlock_conditions: JSON.stringify({},),
      status: "selected",
      selected_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },).execute();

    await db.insertInto("vn_choices",).values({
      id: "choice-tower-avail",
      chat_id: chatId,
      scene_index: 1,
      label: "Climb the Tower",
      description: "A tall tower beckons.",
      consequences: JSON.stringify({},),
      relationship_impact: JSON.stringify({},),
      mood_impact: JSON.stringify({},),
      unlock_conditions: JSON.stringify({},),
      status: "available",
      created_at: new Date().toISOString(),
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  describe("listVnChoices", () => {
    test("returns available choices for scene 0", async () => {
      const result = await listVnChoices(db, { chatId, sceneIndex: 0, },);

      if ("code" in result) {
        throw new Error(`Unexpected error: ${result.code}`,);
      }

      expect(result.ok,).toBe(true,);
      expect(result.choices,).toHaveLength(2,);
      expect(result.choices.every((c,) => c.selected === 0),).toBe(true,);
      expect(result.choices.map((c,) => c.label).sort((a, b,) => a.localeCompare(b,)),).toEqual([
        "Enter the Cave",
        "Enter the Forest",
      ],);
    });

    test("returns only available (not selected) choices for scene 1", async () => {
      const result = await listVnChoices(db, { chatId, sceneIndex: 1, },);

      if ("code" in result) {
        throw new Error(`Unexpected error: ${result.code}`,);
      }

      // Pre-selected choice (status=selected) is NOT returned by listVnChoices
      expect(result.choices,).toHaveLength(1,);
      expect(result.choices[0]!.id,).toBe("choice-tower-avail",);
      expect(result.choices[0]!.selected,).toBe(0,);
    });

    test("returns empty array for non-existent scene", async () => {
      const result = await listVnChoices(db, { chatId, sceneIndex: 999, },);

      if ("code" in result) {
        throw new Error(`Unexpected error: ${result.code}`,);
      }

      expect(result.choices,).toHaveLength(0,);
    });
  });

  describe("selectVnChoice", () => {
    test("marks choice as selected and returns consequences", async () => {
      const result = await selectVnChoice(db, { chatId, choiceId: "choice-cave", },);

      if ("code" in result) {
        throw new Error(`Unexpected error: ${result.code}`,);
      }

      expect(result.ok,).toBe(true,);
      expect(result.choice.id,).toBe("choice-cave",);
      expect(result.choice.selected,).toBe(1,);
      expect(result.choice.selected_at,).toBeTruthy();
      expect(result.locationId,).toBeUndefined();
    });

    test("returns locationId when choice has location consequence", async () => {
      const result = await selectVnChoice(db, { chatId, choiceId: "choice-forest", },);

      if ("code" in result) {
        throw new Error(`Unexpected error: ${result.code}`,);
      }

      expect(result.ok,).toBe(true,);
      expect(result.choice.id,).toBe("choice-forest",);
      expect(result.locationId,).toBe("forest-path",);
    });

    test("returns not_found for non-existent choice", async () => {
      const result = await selectVnChoice(db, { chatId, choiceId: missingChoiceId, },);

      expect(result,).toEqual({
        code: "not_found",
        message: "Choice not found",
      },);
    });

    test("returns not_found when choice belongs to different chat", async () => {
      const result = await selectVnChoice(db, { chatId: missingChatId, choiceId: "choice-cave", },);

      expect(result,).toEqual({
        code: "not_found",
        message: "Choice not found",
      },);
    });
  });
});
