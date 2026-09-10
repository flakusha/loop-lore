// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * travelSection tests — bound/linked travel prompt, gated on
 * `config.assistant.travelPrompts === true` and `chat.world_id` being
 * non-null. Lists up to 12 known locations (excluding the current one),
 * wrapped in <travelPrompts>…</travelPrompts>.
 *
 * Coverage pins:
 *   - disabled when travelPrompts is false / chat has no world_id
 *   - "(none listed)" placeholder when the world has no locations
 *   - excludes the chat's current_location_id
 *   - caps result at 12 (MAX_LOCATION_HINTS)
 *   - always wrapped via wrapSection (xml tag present)
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertChats, insertLocations, insertUsers, insertWorlds, } from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { travelSection, } from "./travel";

describe("travelSection", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let emptyWorldId: string;
  let currentLocationId: string;
  let chatWithWorldId: string;
  let chatWithoutWorldId: string;
  let emptyChatId: string;

  beforeAll(async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    ({ db, } = await createTestDb());
    await insertUsers(db, "gm", "GM",);
    const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    userId = user.id;

    // Populated world: 1 starting + 13 others = 14 total.
    // Excluding the current location leaves 13 eligible; build() caps to 12.
    await insertWorlds(db, userId, "Test World",);
    const worlds = await db.selectFrom("worlds",).select(["id",],)
      .where("name", "=", "Test World",).executeTakeFirstOrThrow();
    worldId = worlds.id;

    const starting = await insertLocations(db, worldId, "Starting Hub",);
    const startingRow = await db.selectFrom("locations",).select(["id",],)
      .where("name", "=", "Starting Hub",).executeTakeFirstOrThrow();
    currentLocationId = startingRow.id;
    void starting; // silence unused

    for (let i = 1; i <= 11; i++) {
      await insertLocations(db, worldId, `Other Place ${i}`,);
    }
    await insertLocations(db, worldId, "Extra A",);
    await insertLocations(db, worldId, "Extra B",);

    // Empty world: chat pinned to it has no locations.
    await insertWorlds(db, userId, "Empty World",);
    const emptyWorldRow = await db.selectFrom("worlds",).select(["id",],)
      .where("name", "=", "Empty World",).executeTakeFirstOrThrow();
    emptyWorldId = emptyWorldRow.id;

    chatWithWorldId = "chat-travel-with-world";
    await insertChats(db, "Travel Chat", userId, {
      id: chatWithWorldId as never,
      world_id: worldId,
      current_location_id: currentLocationId,
    },);
    chatWithoutWorldId = "chat-travel-no-world";
    await insertChats(db, "NoWorld Chat", userId, {
      id: chatWithoutWorldId as never,
      world_id: null,
      current_location_id: null,
    },);
    emptyChatId = "chat-travel-empty-world";
    await insertChats(db, "Empty World Chat", userId, {
      id: emptyChatId as never,
      world_id: emptyWorldId,
      current_location_id: null,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function ctxFor(
    chatId: string,
    world_id: string | null,
    current_location_id: string | null,
    travelPrompts: boolean,
  ): AssembleContext {
    const baseConfig = {
      assistant: { travelPrompts, },
    } as unknown as AssembleContext["config"];
    return {
      db,
      actor: {
        id: "actor-travel-1",
        display_name: "Traveler",
        system_prompt: null,
        description: null,
        personality: null,
        scenario: null,
        post_history_instructions: null,
        mes_example: null,
        agent_role: null,
      },
      chat: { id: chatId, mode: "standard", world_id, current_location_id, },
      params: { actorId: "actor-travel-1", chatId, modelId: "test-model", },
      isStory: false,
      tokenBudget: 4000,
      config: baseConfig,
    };
  }

  test("disabled when travelPrompts is false", () => {
    const ctx = ctxFor(chatWithWorldId, worldId, currentLocationId, false,);
    expect(travelSection.enabled(ctx,),).toBe(false,);
  });

  test("disabled when chat has no world_id", () => {
    const ctx = ctxFor(chatWithoutWorldId, null, null, true,);
    expect(travelSection.enabled(ctx,),).toBe(false,);
  });

  test("enabled when travelPrompts is true and chat has a world_id", () => {
    const ctx = ctxFor(chatWithWorldId, worldId, currentLocationId, true,);
    expect(travelSection.enabled(ctx,),).toBe(true,);
  });

  test("build emits the section wrapped in <travelPrompts> and excludes current location", async () => {
    const ctx = ctxFor(chatWithWorldId, worldId, currentLocationId, true,);
    const messages = await travelSection.build(ctx,);

    expect(messages.length,).toBe(1,);
    const content = messages[0]!.content;
    expect(messages[0]!.role,).toBe("system",);
    expect(content.startsWith("<travelPrompts>",),).toBe(true,);
    expect(content.endsWith("</travelPrompts>",),).toBe(true,);

    // Current location must be excluded from the visible list.
    expect(content,).not.toContain("Starting Hub",);

    // At least one of the other places appears.
    expect(content,).toContain("Other Place 1",);
  });

  test("build caps the listed locations at 12 even when more exist", async () => {
    const ctx = ctxFor(chatWithWorldId, worldId, currentLocationId, true,);
    const messages = await travelSection.build(ctx,);
    const content = messages[0]!.content;

    const placeMatches = content.match(/Other Place \d+|Extra [AB]/g,) ?? [];
    expect(placeMatches.length,).toBeLessThanOrEqual(12,);
    // 14 total - 1 starting excluded = 13 eligible - 1 dropped by cap = 12 visible.
    expect(placeMatches.length,).toBe(12,);
  });

  test("build renders the (none listed) placeholder when no other locations exist", async () => {
    const ctx = ctxFor(emptyChatId, emptyWorldId, null, true,);
    const messages = await travelSection.build(ctx,);
    expect(messages.length,).toBe(1,);
    expect(messages[0]!.content,).toContain("(none listed)",);
  });
});
