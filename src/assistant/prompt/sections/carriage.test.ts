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
import { createAssemblyGate, } from "../carriage-isolation";
import { CARRIAGE_CONFIG_KEY, carriageEntries, carriageSection, isCarriageEnabled, } from "./carriage";

const VALID_TOML = [
  "episode = 4",
  'title = "The Sleeper\'s Warning"',
  "[[characters]]",
  'name = "K"',
  'status = "Inside the ruin"',
].join("\n",);

/**
 * Persisted scope=`carriage` payload shape: `{ toml }` authored by the LLM
 * writer (src/chat/service/carriage-authoring.ts).
 * @param toml - raw carriage TOML
 * @returns the JSON payload string to seed
 */
function tomlPayload(toml: string,): string {
  return JSON.stringify({ toml, },);
}

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
    expect(isCarriageEnabled(JSON.stringify({ [CARRIAGE_CONFIG_KEY]: true, },),),).toBe(true,);
  });

  test("reads the persisted gm_config key, nothing else", () => {
    // The gm_config blob is a stored presentation key — a rename here
    // silently disables the feature for every already-persisted chat.
    expect(CARRIAGE_CONFIG_KEY,).toBe("carriageEnabled",);
    expect(isCarriageEnabled(JSON.stringify({ carriageEnabled: "yes", },),),).toBe(false,);
    expect(isCarriageEnabled(JSON.stringify({ carriageEnabled: false, },),),).toBe(false,);
  });
});

describe("carriageSection", () => {
  test("toggle off → empty section", async () => {
    const { db, } = await createTestDb();
    await seedChat(db, null,);
    await insertCarriageRecords(db, "chat-1", "carriage", tomlPayload(VALID_TOML,), "2026-08-01T00:00:00Z",);
    const messages = await carriageSection.build(makeCtx(db, "chat-1", null,),);
    expect(messages,).toHaveLength(0,);
  });

  test("toggle on → canonical block injects with the instruction", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ [CARRIAGE_CONFIG_KEY]: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(db, "chat-1", "carriage", tomlPayload(VALID_TOML,), "2026-08-01T00:00:00Z",);
    const messages = await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),);
    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.role,).toBe("system",);
    expect(messages[0]!.content,).toContain("<carriage>",);
    expect(messages[0]!.content,).toContain("[[characters]]",);
    expect(messages[0]!.content,).toContain('name = "K"',);
    expect(messages[0]!.content,).toContain("hidden memory context",);
  });

  test("gate-on rendering is byte-identical to the direct render", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ [CARRIAGE_CONFIG_KEY]: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(db, "chat-1", "carriage", tomlPayload(VALID_TOML,), "2026-08-01T00:00:00Z",);
    const bare = await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),);
    const gated = await carriageSection.build({
      ...makeCtx(db, "chat-1", gmConfig,),
      injectables: createAssemblyGate("player",),
    },);

    expect(gated,).toEqual(bare,);
  });

  test("gate-on dedup: a fact another system submitted drops from the block", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ [CARRIAGE_CONFIG_KEY]: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(db, "chat-1", "carriage", tomlPayload(VALID_TOML,), "2026-08-01T00:00:00Z",);
    const gate = createAssemblyGate("player",);
    // Another system (memory) already injected K's carriage fact.
    gate.submit([
      { system: "memory", id: "m1", content: "K: Inside the ruin", visibility: "player", },
    ],);

    const messages = await carriageSection.build({
      ...makeCtx(db, "chat-1", gmConfig,),
      injectables: gate,
    },);

    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.content,).not.toContain('name = "K"',);
    expect(messages[0]!.content,).toContain("episode = 4",);
    expect(gate.report().duplicates,).toHaveLength(1,);
  });

  test("carry-log rows never reach the TOML block (scope filter)", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ [CARRIAGE_CONFIG_KEY]: true, },);
    await seedChat(db, gmConfig,);
    // Newest row is a cross-context carry record — not carriage TOML.
    await insertCarriageRecords(db, "chat-1", "carriage", tomlPayload(VALID_TOML,), "2026-08-01T00:00:00Z",);
    await insertCarriageRecords(db, "chat-1", "session", JSON.stringify({ step: 1, },), "2026-08-02T00:00:00Z",);
    const messages = await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),);
    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.content,).toContain('name = "K"',);
  });

  test("flat character list cancels with zero messages", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ [CARRIAGE_CONFIG_KEY]: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(
      db,
      "chat-1",
      "carriage",
      tomlPayload('characters = ["K", "G"]\n',),
      "2026-08-01T00:00:00Z",
    );

    const messages = await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),);
    expect(messages,).toHaveLength(0,);
  });

  test("oversize payload cancels with zero messages", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ [CARRIAGE_CONFIG_KEY]: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(
      db,
      "chat-1",
      "carriage",
      tomlPayload(`x = "${"y".repeat(9_000,)}"`,),
      "2026-08-01T00:00:00Z",
    );

    const messages = await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),);
    expect(messages,).toHaveLength(0,);
  });

  test("missing or malformed { toml } payload injects nothing", async () => {
    const { db, } = await createTestDb();
    const gmConfig = JSON.stringify({ [CARRIAGE_CONFIG_KEY]: true, },);
    await seedChat(db, gmConfig,);
    await insertCarriageRecords(db, "chat-1", "carriage", JSON.stringify({ other: 1, },), "2026-08-01T00:00:00Z",);
    expect(await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),),).toHaveLength(0,);
    await insertCarriageRecords(db, "chat-1", "carriage", "{broken", "2026-08-03T00:00:00Z",);
    expect(await carriageSection.build(makeCtx(db, "chat-1", gmConfig,),),).toHaveLength(0,);
  });
});

describe("carriageEntries", () => {
  test("splits an approved doc into one plain-fact entry per fact", () => {
    const entries = carriageEntries({
      episode: 4,
      title: "The Sleeper's Warning",
      setting: "Ruin on largest island",
      characters: [
        { name: "K", status: "Inside the ruin", },
        { name: "G", status: "With party", },
      ],
    },);

    expect(entries,).toEqual([
      { system: "carriage", id: "episode", content: "episode 4", visibility: "player", },
      { system: "carriage", id: "title", content: "The Sleeper's Warning", visibility: "player", },
      { system: "carriage", id: "setting", content: "Ruin on largest island", visibility: "player", },
      { system: "carriage", id: "character-0", content: "K: Inside the ruin", visibility: "player", },
      { system: "carriage", id: "character-1", content: "G: With party", visibility: "player", },
    ],);
  });

  test("omits absent fields and tolerates a characterless doc", () => {
    expect(carriageEntries({},),).toEqual([],);
    expect(carriageEntries({ episode: 1, },),).toEqual([
      { system: "carriage", id: "episode", content: "episode 1", visibility: "player", },
    ],);
  });
});
