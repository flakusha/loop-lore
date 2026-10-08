// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hidden carriage section tests (TASK-hidden-carriage-toml-context):
 * toggle off → empty (byte-identical baseline); toggle on → canonical
 * [[characters]] block injects; invalid/oversize payloads cancel silently
 * into the prompt (dev-visible warning via logger) with zero messages.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertCarriageRecords,
  insertChatParticipants,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { carriageSection, isCarriageEnabled, } from "./carriage";

const VALID_TOML = [
  "episode = 4",
  'title = "The Sleeper\'s Warning"',
  "[[characters]]",
  'name = "K"',
  'status = "Inside the ruin"',
].join("\n",);

/**
 * @param db
 * @param chatId
 */
function makeCtx(db: Kysely<DB>, chatId: string, gmConfig: string | null,) {
  return {
    db,
    actor: {
      id: "actor-1",
      display_name: "Test Actor",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: {
      id: chatId,
      mode: "story",
      world_id: "world-1",
      current_location_id: null,
      gm_config: gmConfig,
    },
    params: { actorId: "actor-1", chatId, modelId: "test-model", },
    isStory: true,
    tokenBudget: 32_000,
  };
}

/**
 * @param db
 */
async function seedChat(db: Kysely<DB>, gmConfig: string | null,) {
  await insertUsers(db, "user1", "User 1", { id: "user-1", } as any,);
  await insertWorlds(db, "user-1", "Test World", { id: "world-1", } as any,);
  await insertActors(db, "Alice", { id: "actor-1", user_id: "user-1", } as any,);
  await insertChats(db, "Test Chat", "user-1", {
    id: "chat-1",
    world_id: "world-1",
    gm_config: gmConfig,
  } as any,);

  await insertChatParticipants(db, "chat-1", "actor-1",);
}

describe("isCarriageEnabled", () => {
  test("true only for an explicit opt-in", () => {
    expect(isCarriageEnabled(null,),).toBe(false,);
    expect(isCarriageEnabled("{bad json",),).toBe(false,);
    expect(isCarriageEnabled("{}",),).toBe(false,);
    expect(isCarriageEnabled(JSON.stringify({ carriageEnabled: true, },),),).toBe(true,);
  });
});

describe("carriageSection", () => {
  test("toggle off → empty section", async () => {
    const { db, } = await createTestDb();
    await seedChat(db, null,);
    await insertCarriageRecords(db, "chat-1", "session", VALID_TOML, "2026-08-01T00:00:00Z",);
    const messages = await carriageSection.build(makeCtx(db, "chat-1", null,),);
    expect(messages,).toHaveLength(0,);
  });

  test("toggle on → canonical block injects with the instruction", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ carriageEnabled: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(db, "chat-1", "session", VALID_TOML, "2026-08-01T00:00:00Z",);
    const messages = await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),);
    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.role,).toBe("system",);
    expect(messages[0]!.content,).toContain("<carriage>",);
    expect(messages[0]!.content,).toContain("[[characters]]",);
    expect(messages[0]!.content,).toContain('name = "K"',);
    expect(messages[0]!.content,).toContain("hidden memory context",);
  });

  test("flat character list cancels with zero messages", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ carriageEnabled: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(
      db,
      "chat-1",
      "session",
      'characters = ["K", "G"]\n',
      "2026-08-01T00:00:00Z",
    );

    const messages = await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),);
    expect(messages,).toHaveLength(0,);
  });

  test("oversize payload cancels with zero messages", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ carriageEnabled: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(db, "chat-1", "session", `x = "${"y".repeat(9_000,)}"`, "2026-08-01T00:00:00Z",);
    const messages = await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),);
    expect(messages,).toHaveLength(0,);
  });
});
