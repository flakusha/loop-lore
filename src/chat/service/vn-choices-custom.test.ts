// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for chat/service/vn-choices-custom.ts — the "or type your own"
 * branching-choice creation path.
 *
 * Selection is NOT re-tested here: `createCustomVnChoice` only authors the
 * row; the route then calls the existing `selectVnChoice`, whose contract is
 * pinned by vn-choices.test.ts.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import {
  createCustomVnChoice,
  type CreateCustomVnChoiceResult,
  type CreateCustomVnChoiceSuccess,
} from "./vn-choices-custom";

/** Narrow a creation result to its success shape (vn-questions.test.ts convention). */
function created(result: CreateCustomVnChoiceResult,): CreateCustomVnChoiceSuccess {
  if (!("ok" in result)) { throw new Error(`Unexpected error: ${result.code}`,); }
  return result;
}

describe("createCustomVnChoice", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    const ownerId = await insertUsers(db, "owner", "Owner", {} as never,);
    chatId = await insertChats(db, "VN chat", ownerId, { mode: "vn", } as never,);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("creates an available row labelled with the typed action", async () => {
    const result = created(
      await createCustomVnChoice(db, {
        chatId,
        sceneIndex: 3,
        freeText: "  I bolt the door behind me  ",
      },),
    );

    expect(result.choice.id.startsWith("custom-",),).toBe(true,);
    expect(result.choice.label,).toBe("I bolt the door behind me",);
    expect(result.choice.scene_index,).toBe(3,);
    expect(result.choice.consequences,).toEqual({ provenance: "custom", },);
    expect(result.choice.relationship_impact,).toEqual({},);
    expect(result.choice.mood_impact,).toEqual({},);

    const row = await db.selectFrom("vn_choices",).selectAll()
      .where("id", "=", result.choice.id,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("available",);
    expect(row.chat_id,).toBe(chatId,);
    expect(JSON.parse(row.consequences,),).toEqual({ provenance: "custom", },);
  });

  test("rejects a blank typed action", async () => {
    const result = await createCustomVnChoice(db, {
      chatId,
      sceneIndex: 0,
      freeText: "   ",
    },);

    expect(result,).toEqual({ code: "bad_request", message: "freeText must not be empty", },);
  });

  test("rejects an over-cap typed action", async () => {
    const result = await createCustomVnChoice(db, {
      chatId,
      sceneIndex: 0,
      freeText: "a".repeat(2001,),
    },);

    expect(result,).toEqual({
      code: "bad_request",
      message: "freeText must be at most 2000 characters",
    },);
  });

  test("rejects a non-string typed action", async () => {
    const result = await createCustomVnChoice(db, {
      chatId,
      sceneIndex: 0,
      freeText: 7,
    },);

    expect(result,).toEqual({ code: "bad_request", message: "freeText must be a string", },);
  });

  test("rejects a negative scene index", async () => {
    const result = await createCustomVnChoice(db, {
      chatId,
      sceneIndex: -1,
      freeText: "I wait",
    },);

    expect(result,).toEqual({
      code: "bad_request",
      message: "sceneIndex must be a non-negative integer",
    },);
  });

  test("rejects a non-integer scene index", async () => {
    const result = await createCustomVnChoice(db, {
      chatId,
      sceneIndex: Number.NaN,
      freeText: "I wait",
    },);

    expect(result,).toEqual({
      code: "bad_request",
      message: "sceneIndex must be a non-negative integer",
    },);
  });
});
