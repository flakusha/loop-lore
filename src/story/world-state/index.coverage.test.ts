// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World State Service — dispatcher class coverage (index.ts).
 *
 * Exercises the WorldStateService methods: buildContext (null paths,
 * damaged JSON blobs, turn limits, participant filtering), snapshot
 * (defaults and optional args), and the getNpcState/getLocationState/
 * getNpcsAtLocation lookups including unknown-id boundaries.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { sql, } from "kysely";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertLocations,
  insertLocationStates,
  insertMessages,
  insertNpcStates,
  insertQuests,
  insertStoryTurns,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { WorldStateService, } from "./index";

let db: Kysely<DB>;
let worldId: string;
let userId: string;

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  ({ db, } = await createTestDb());
  userId = uid();
  await insertUsers(db, `user-${userId}`, "Owner", { id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Index World", { id: worldId, } as never,);
},);

afterEach(async () => {
  await db.destroy();
},);

/**
 * @param name
 * @param agentType
 */
async function seedMember(name: string, agentType: string,): Promise<string> {
  const id = uid();
  await insertActors(db, name, { id, actor_type: "character", agent_type: agentType, } as never,);
  return id;
}

describe("WorldStateService.buildContext", () => {
  test("returns null for unknown chat id", async () => {
    const svc = new WorldStateService(db,);
    expect(await svc.buildContext(uid(),),).toBeNull();
  });

  test("returns null when chat has no world_id", async () => {
    const chatId = await insertChats(db, "Chat", userId, { mode: "story", },);
    const svc = new WorldStateService(db,);
    expect(await svc.buildContext(chatId,),).toBeNull();
  });

  test("returns null when the world row is missing", async () => {
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    await sql`PRAGMA foreign_keys = OFF`.execute(db,);
    await db.deleteFrom("worlds",).where("id", "=", worldId,).execute();
    await sql`PRAGMA foreign_keys = ON`.execute(db,);
    const svc = new WorldStateService(db,);
    expect(await svc.buildContext(chatId,),).toBeNull();
  });

  test("builds full context from DB state", async () => {
    const locId = await insertLocations(db, worldId, "Tavern", { connections: "[]", } as never,);
    await insertLocationStates(db, locId, worldId, { atmosphere: "cozy", },);
    const chatId = await insertChats(db, "Chat", userId, {
      world_id: worldId,
      current_location_id: locId,
      story_state: JSON.stringify({
        currentTurn: 3,
        currentActorId: "a1",
        turnOrder: ["a1",],
        strategy: "hybrid",
        isPaused: false,
        lastTurnCompletedAt: null,
        pendingRegeneration: null,
      },),
      turn_strategy: "hybrid",
    },);

    const actorId = await seedMember("Hero", "npc",);
    await insertChatParticipants(db, chatId, actorId,);
    await insertNpcStates(db, actorId, worldId, {
      location_id: locId,
      health: 80,
      mental_state: "calm",
      schedule: JSON.stringify({ movementPattern: "patrol", targetLocationId: locId, },),
    },);

    await insertQuests(db, worldId, actorId, "Find the Key", "collection", 1, {
      status: "active",
      priority: 5,
      config: JSON.stringify({ type: "collection", },),
    },);

    await insertStoryTurns(db, chatId, 1, actorId, "character_action", "What do you do?", {
      status: "accepted",
      response_received: "I search.",
      quality_score: 42,
    },);

    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx,).not.toBeNull();
    expect(ctx!.world.name,).toBe("Index World",);
    expect(ctx!.world.currentLocation.name,).toBe("Tavern",);
    expect(ctx!.world.currentLocation.id,).toBe(locId,);
    expect(ctx!.world.currentLocation.atmosphere,).toBe("cozy",);
    expect(ctx!.turnManagerState.currentTurn,).toBe(3,);
    expect(ctx!.turnManagerState.currentActorId,).toBe("a1",);
    expect(ctx!.actors,).toHaveLength(1,);
    expect(ctx!.actors[0]!.id,).toBe(actorId,);
    expect(ctx!.actors[0]!.npcState?.health,).toBe(80,);
    expect(ctx!.actors[0]!.npcState?.mental_state,).toBe("calm",);
    expect(ctx!.actors[0]!.npcState?.movementPattern,).toBe("patrol",);
    expect(ctx!.actors[0]!.npcState?.movementTarget,).toBe(locId,);
    expect(ctx!.actors[0]!.locationId,).toBe(locId,);
    expect(ctx!.activeQuests,).toHaveLength(1,);
    expect(ctx!.activeQuests[0]!.name,).toBe("Find the Key",);
    expect(ctx!.activeQuests[0]!.config.type,).toBe("collection",);
    expect(ctx!.recentTurns,).toHaveLength(1,);
    expect(ctx!.recentTurns[0]!.turnNumber,).toBe(1,);
    expect(ctx!.recentTurns[0]!.response,).toBe("I search.",);
    expect(ctx!.recentTurns[0]!.qualityScore,).toBe(42,);
  });

  test("damaged story_state JSON → defaults with turn_strategy fallback", async () => {
    const chatId = await insertChats(db, "Chat", userId, {
      world_id: worldId,
      story_state: "{{{not json",
      turn_strategy: "round_robin",
    },);

    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx,).not.toBeNull();
    expect(ctx!.turnManagerState.currentTurn,).toBe(0,);
    expect(ctx!.turnManagerState.currentActorId,).toBeNull();
    expect(ctx!.turnManagerState.turnOrder,).toEqual([],);
    expect(ctx!.turnManagerState.strategy,).toBe("round_robin",);
    expect(ctx!.turnManagerState.isPaused,).toBe(false,);
  });

  test("missing story_state → defaults, strategy from turn_strategy column", async () => {
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, turn_strategy: "hybrid", },);
    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx,).not.toBeNull();
    expect(ctx!.turnManagerState.currentTurn,).toBe(0,);
    expect(ctx!.turnManagerState.strategy,).toBe("hybrid",);
  });

  test("current_location_id pointing at missing location → 'unknown' name, empty id", async () => {
    const locId = await insertLocations(db, worldId, "Nowhere",);
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, current_location_id: locId, },);
    await sql`PRAGMA foreign_keys = OFF`.execute(db,);
    await db.deleteFrom("locations",).where("id", "=", locId,).execute();
    await sql`PRAGMA foreign_keys = ON`.execute(db,);
    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx,).not.toBeNull();
    expect(ctx!.world.currentLocation.name,).toBe("unknown",);
    expect(ctx!.world.currentLocation.id,).toBe("",);
    expect(ctx!.world.currentLocation.atmosphere,).toBeNull();
    expect(ctx!.world.currentLocation.description,).toBe("",);
  });

  test("damaged location_states JSON arrays → fall back to empty", async () => {
    const locId = await insertLocations(db, worldId, "Cave",);
    await insertLocationStates(db, locId, worldId, {
      atmosphere: "damp",
      npcs_present: "{{{",
      items_available: "]]]",
      hazards: "not json",
    },);

    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, current_location_id: locId, },);
    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx,).not.toBeNull();
    expect(ctx!.world.currentLocation.name,).toBe("Cave",);
    expect(ctx!.world.currentLocation.atmosphere,).toBe("damp",);
  });

  test("damaged quest config → empty config object", async () => {
    const creator = await seedMember("Creator", "npc",);
    await insertQuests(db, worldId, creator, "Bad Config", "collection", 1, {
      status: "active",
      config: "{{{",
    },);

    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx,).not.toBeNull();
    expect(ctx!.activeQuests,).toHaveLength(1,);
    expect(ctx!.activeQuests[0]!.config as unknown as Record<string, unknown>,).toEqual({},);
  });

  test("non-active quests are excluded", async () => {
    const creator = await seedMember("Creator", "npc",);
    await insertQuests(db, worldId, creator, "Done Quest", "collection", 1, { status: "completed", },);
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx!.activeQuests,).toHaveLength(0,);
  });

  test("recentTurnCount limits recent turns, oldest of the window first", async () => {
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    const actorId = await seedMember("Hero", "npc",);
    for (let i = 1; i <= 15; i++) {
      await insertStoryTurns(db, chatId, i, actorId, "character_action", `prompt ${i}`, { status: "accepted", },);
    }

    const ctx = await new WorldStateService(db,).buildContext(chatId, 5,);
    expect(ctx!.recentTurns,).toHaveLength(5,);
    expect(ctx!.recentTurns.map((t,) => t.turnNumber),).toEqual([11, 12, 13, 14, 15,],);
  });

  test("only accepted turns become recent turns", async () => {
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    const actorId = await seedMember("Hero", "npc",);
    await insertStoryTurns(db, chatId, 1, actorId, "character_action", "p1", { status: "accepted", },);
    await insertStoryTurns(db, chatId, 2, actorId, "character_action", "p2", { status: "pending", },);
    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx!.recentTurns,).toHaveLength(1,);
    expect(ctx!.recentTurns[0]!.turnNumber,).toBe(1,);
  });

  test("no participants → empty actors list", async () => {
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx!.actors,).toEqual([],);
  });

  test("human participant gets no npcState even with an npc_states row", async () => {
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    const actorId = await seedMember("Player", "human",);
    await insertChatParticipants(db, chatId, actorId,);
    await insertNpcStates(db, actorId, worldId, { health: 50, },);
    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    expect(ctx!.actors,).toHaveLength(1,);
    expect(ctx!.actors[0]!.agentType,).toBe("human",);
    expect(ctx!.actors[0]!.npcState,).toBeUndefined();
  });

  test("damaged npc schedule/knowledge/relationships JSON → defaults", async () => {
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    const actorId = await seedMember("NPC", "npc",);
    await insertChatParticipants(db, chatId, actorId,);
    await insertNpcStates(db, actorId, worldId, {
      schedule: "{{{",
      knowledge: "]]]",
      relationships: "not json",
    },);

    const ctx = await new WorldStateService(db,).buildContext(chatId,);
    const npc = ctx!.actors[0]!.npcState!;
    expect(npc.movementPattern,).toBe("stationary",);
    expect(npc.movementTarget,).toBeNull();
    expect(npc.knowledge,).toEqual({},);
    expect(npc.relationships,).toEqual({},);
  });
});

describe("WorldStateService.snapshot", () => {
  test("creates snapshot row with defaults", async () => {
    const id = await new WorldStateService(db,).snapshot(worldId,);
    expect(id,).toBeTruthy();
    const row = await db.selectFrom("world_states",).selectAll().where("id", "=", id,).executeTakeFirstOrThrow();
    expect(row.snapshot,).toBe("{}",);
    expect(row.description,).toBe("Auto-snapshot",);
    expect(row.trigger_turn_id,).toBeNull();
    expect(row.trigger_message_id,).toBeNull();
  });

  test("stores optional turn/message/description", async () => {
    const chatId = await insertChats(db, "Chat", userId, { world_id: worldId, },);
    const actorId = await seedMember("NPC", "npc",);
    const turnId = await insertStoryTurns(db, chatId, 1, actorId, "character_action", "p", { status: "accepted", },);
    const msgId = await insertMessages(db, chatId, actorId, "assistant", "hello",);
    const id = await new WorldStateService(db,).snapshot(worldId, turnId, msgId, "Manual",);
    const row = await db.selectFrom("world_states",).selectAll().where("id", "=", id,).executeTakeFirstOrThrow();
    expect(row.trigger_turn_id,).toBe(turnId,);
    expect(row.trigger_message_id,).toBe(msgId,);
    expect(row.description,).toBe("Manual",);
  });
});

describe("WorldStateService.getNpcState", () => {
  test("returns the npc_states row for actor+world", async () => {
    const actorId = await seedMember("NPC", "npc",);
    await insertNpcStates(db, actorId, worldId, { health: 65, mental_state: "angry", },);
    const row = await new WorldStateService(db,).getNpcState(actorId, worldId,);
    expect(row?.health,).toBe(65,);
    expect(row?.mental_state,).toBe("angry",);
  });

  test("undefined for unknown actor", async () => {
    expect(await new WorldStateService(db,).getNpcState(uid(), worldId,),).toBeUndefined();
  });

  test("undefined when the actor belongs to a different world", async () => {
    const actorId = await seedMember("NPC", "npc",);
    const otherWorld = uid();
    await insertWorlds(db, userId, "Other", { id: otherWorld, } as never,);
    await insertNpcStates(db, actorId, otherWorld, { health: 10, },);
    expect(await new WorldStateService(db,).getNpcState(actorId, worldId,),).toBeUndefined();
  });
});

describe("WorldStateService.getLocationState", () => {
  test("returns the location_states row", async () => {
    const locId = await insertLocations(db, worldId, "Hall",);
    await insertLocationStates(db, locId, worldId, { atmosphere: "dark", },);
    const row = await new WorldStateService(db,).getLocationState(locId,);
    expect(row?.atmosphere,).toBe("dark",);
  });

  test("undefined for unknown location", async () => {
    expect(await new WorldStateService(db,).getLocationState(uid(),),).toBeUndefined();
  });
});

describe("WorldStateService.getNpcsAtLocation", () => {
  test("returns NPCs at the location with actor columns", async () => {
    const locA = await insertLocations(db, worldId, "A",);
    const locB = await insertLocations(db, worldId, "B",);
    const npc1 = await seedMember("Guard", "npc",);
    const npc2 = await seedMember("Mage", "ai",);
    const human = await seedMember("Player", "human",);
    await insertNpcStates(db, npc1, worldId, { location_id: locA, health: 90, },);
    await insertNpcStates(db, npc2, worldId, { location_id: locB, health: 50, },);
    await insertNpcStates(db, human, worldId, { location_id: locA, health: 70, },);
    const rows = await new WorldStateService(db,).getNpcsAtLocation(locA,);
    expect(rows,).toHaveLength(2,);
    expect(rows.map((r,) => r.display_name).sort(),).toEqual(["Guard", "Player",],);
    expect(rows.map((r,) => r.agent_type).sort() as unknown as string[],).toEqual(["human", "npc",],);
  });

  test("empty for unknown location", async () => {
    expect(await new WorldStateService(db,).getNpcsAtLocation(uid(),),).toEqual([],);
  });
});
