// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `runGmBeat` movement-accounting guard.
 *
 * Movement is a first-class scheduler dispatch target, registered BEFORE
 * any extra target, so `runGmBeat` calls `executeTurn` with
 * `moveNpcs: false`. Without that opt-out a tick that dispatches both
 * advances every NPC twice per pass: a 2-stop patrol route runs
 * `patrolIndex` 0 -> 1 -> 0, so the NPC ends up back where it started and
 * the double move is invisible from the destination alone.
 *
 * Covered here through ONE real `AutonomyScheduler.tickOnce()` with both
 * the built-in movement target and the real `createGmBeatDispatch` target:
 *   - the tick advanced the NPC EXACTLY one route step (loc + patrolIndex)
 *   - the beat genuinely ran (`dispatched: 2`), so a skipped beat cannot
 *     make the single-step assertion pass for the wrong reason
 *   - `executeTurn` with `moveNpcs: false` leaves the NPC put on its own
 *   - `executeTurn` with no options still moves NPCs (the opt-out is opt-in)
 *
 * Generation is the injected `generateText` seam, so no provider is
 * touched. The chat carries a production-shaped `gm_config` (`llm`) and
 * the injected factory builds a matching `llm`-type service.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { createGmBeatDispatch, } from "../../autonomy/dispatch/gm-beat-dispatch";
import { AutonomyScheduler, } from "../../autonomy/scheduler";
import { GameMasterType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { MovementPattern, } from "../../rpg/npc-navigation/service/types";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertLocations,
  insertLocationStates,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { toDate, } from "../../utils/date";
import { GameMasterService, type GenerateTextFn, } from "./index";

let db: Kysely<DB>;

/** Fixed instant so the cursor arithmetic is exact. */
const T0 = 1_800_000_000_000;

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

/** A world whose only chat is an LLM-GM story chat, plus a patrolling NPC
 *  on a 2-stop route. `jitterRatio: 0` so the movement target never drops
 *  the tick on a coin flip. */
async function makePatrolWorld(name: string,) {
  const ownerId = uid();
  const worldId = uid();
  await insertUsers(db, "owner-" + ownerId, "Owner " + name, { id: ownerId, },);
  await insertWorlds(db, ownerId, name, {
    id: worldId,
    autonomy_config: JSON.stringify({ jitterRatio: 0, },),
  },);

  const locA = uid();
  const locB = uid();
  await insertLocations(db, worldId, "a", { id: locA, },);
  await insertLocations(db, worldId, "b", { id: locB, },);
  await insertLocationStates(db, locA, worldId,);
  await insertLocationStates(db, locB, worldId,);

  // The storyteller: a story-mode participant so the beat can pick a
  // speaker. A separate actor from the NPC below.
  const actorId = uid();
  await insertActors(db, "Hero " + actorId, { id: actorId, actor_type: "character", agent_type: "ai", },);

  const chatId = uid();
  await insertChats(db, "chat-" + chatId, ownerId, {
    id: chatId,
    world_id: worldId,
    mode: "story",
    type: "direct",
    current_location_id: locA,
    gm_config: JSON.stringify({ type: GameMasterType.Llm, },),
  },);
  await db
    .insertInto("chat_participants",)
    .values({ chat_id: chatId, actor_id: actorId, role_in_chat: "member", },)
    .execute();

  const npcId = uid();
  await insertActors(db, "Guard " + npcId, { id: npcId, actor_type: "character", agent_type: "npc", },);
  await insertNpcStates(db, npcId, worldId, {
    location_id: locA,
    schedule: JSON.stringify({
      movementPattern: MovementPattern.Patrol,
      patrolRoute: [locA, locB,],
      patrolIndex: 0,
    },),
  },);

  return { worldId, chatId, npcId, locA, locB, };
}

/** Force a world's cursor so `tickOnce` selects it. */
async function setDue(worldId: string,): Promise<void> {
  const row = { next_tick_at: toDate(T0 - 10_000,).toISOString(), paused: 0, };
  await db
    .insertInto("world_simulation_state",)
    .values({ world_id: worldId, ...row, last_run_at: null, last_error: null, tick_count: 0, },)
    .onConflict((oc,) => oc.column("world_id",).doUpdateSet(row,))
    .execute();
}

/** Read the NPC's post-tick location + patrol index. */
async function npcAt(npcId: string,): Promise<{ locationId: string | null; patrolIndex: number }> {
  const row = await db
    .selectFrom("npc_states",)
    .select(["location_id", "schedule",],)
    .where("actor_id", "=", npcId,)
    .executeTakeFirstOrThrow();
  const schedule = JSON.parse(row.schedule ?? "{}",) as { patrolIndex?: number };
  return { locationId: row.location_id, patrolIndex: schedule.patrolIndex ?? 0, };
}

describe("AutonomyScheduler.tickOnce — movement + GM beat on one tick", () => {
  test("a tick dispatching both advances the NPC exactly one route step", async () => {
    const world = await makePatrolWorld("double-move",);
    await setDue(world.worldId,);

    let generateCalls = 0;
    const generateText: GenerateTextFn = () => {
      generateCalls += 1;
      return Promise.resolve("*The guard walks the wall.*",);
    };

    const sched = new AutonomyScheduler(db, {
      dispatch: [
        createGmBeatDispatch({
          createGm: (chat,) =>
            new GameMasterService({
              db,
              chatId: chat.id,
              gmConfig: {
                type: GameMasterType.Llm,
                llmConfig: {
                  model: "test-model",
                  provider: "test-provider",
                  systemPrompt: "GM",
                  temperature: 0.7,
                  maxTokens: 800,
                },
              },
              generateText,
            },),
        },),
      ],
    },);

    const result = await sched.tickOnce(T0,);
    expect(result.errors,).toBe(0,);

    // movement dispatched 1 (the NPC) + the beat dispatched 1. Proves the
    // beat ran rather than skipping: a skip would report 1 and make the
    // single-step assertion below pass for the wrong reason.
    expect(result.worlds[0]?.outcome,).toEqual({ dispatched: 2, },);
    expect(generateCalls,).toBe(1,);

    // ONE route step: locA -> locB, patrolIndex 0 -> 1. A second movement
    // pass would carry the guard on to locA again (index 1 -> 0).
    expect(await npcAt(world.npcId,),).toEqual({ locationId: world.locB, patrolIndex: 1, },);
  });

  test("the beat records the story turn it produced", async () => {
    const world = await makePatrolWorld("beat-turn",);
    await setDue(world.worldId,);

    const sched = new AutonomyScheduler(db, {
      dispatch: [
        createGmBeatDispatch({
          createGm: (chat,) =>
            new GameMasterService({
              db,
              chatId: chat.id,
              gmConfig: {
                type: GameMasterType.Llm,
                llmConfig: {
                  model: "test-model",
                  provider: "test-provider",
                  systemPrompt: "GM",
                  temperature: 0.7,
                  maxTokens: 800,
                },
              },
              generateText: () => Promise.resolve("*The guard walks the wall.*",),
            },),
        },),
      ],
    },);
    await sched.tickOnce(T0,);

    const turns = await db
      .selectFrom("story_turns",)
      .select(["chat_id", "turn_number", "prompt_sent",],)
      .where("chat_id", "=", world.chatId,)
      .execute();
    expect(turns.length,).toBe(1,);
    expect(turns[0]?.turn_number,).toBe(1,);
    expect(turns[0]?.prompt_sent,).toBe("*The guard walks the wall.*",);
  });
});

describe("executeTurn — moveNpcs opt-out", () => {
  test("moveNpcs: false leaves a patrolling NPC where it was", async () => {
    const world = await makePatrolWorld("opt-out",);
    const gm = new GameMasterService({
      db,
      chatId: world.chatId,
      gmConfig: {
        type: GameMasterType.Llm,
        llmConfig: {
          model: "test-model",
          provider: "test-provider",
          systemPrompt: "GM",
          temperature: 0.7,
          maxTokens: 800,
        },
      },
      generateText: () => Promise.resolve("*The guard walks the wall.*",),
    },);
    await gm.initialize();

    const result = await gm.executeTurn(undefined, { moveNpcs: false, },);
    expect(result.worldEvents,).toEqual([],);
    expect(await npcAt(world.npcId,),).toEqual({ locationId: world.locA, patrolIndex: 0, },);
  });

  test("no options still moves NPCs — the opt-out is opt-in", async () => {
    const world = await makePatrolWorld("default-move",);
    const gm = new GameMasterService({
      db,
      chatId: world.chatId,
      gmConfig: {
        type: GameMasterType.Llm,
        llmConfig: {
          model: "test-model",
          provider: "test-provider",
          systemPrompt: "GM",
          temperature: 0.7,
          maxTokens: 800,
        },
      },
      generateText: () => Promise.resolve("*The guard walks the wall.*",),
    },);
    await gm.initialize();

    const result = await gm.executeTurn(undefined,);
    expect(result.worldEvents.length,).toBe(1,);
    expect(await npcAt(world.npcId,),).toEqual({ locationId: world.locB, patrolIndex: 1, },);
  });
});
