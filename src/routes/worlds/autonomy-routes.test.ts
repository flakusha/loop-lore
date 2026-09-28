// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the autonomy read + control surface
 * (TASK-autonomy-config-surface, TASK-autonomy-rate-governor,
 * TASK-story-auto-drive-scheduler).
 *
 * Each case asserts what a settings page actually consumes: the
 * per-layer values (so a page can tell inherited from overridden), the
 * live budget window, and the persisted pause/cursor. Two guard real
 * defects: a read must not spend budget (peek, not tryConsume), and a
 * non-owner must neither read caps nor drive the loop.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AutonomyGovernor, } from "../../autonomy/governor";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { autonomyRoutes, } from "./autonomy-routes";
import type { HandleOpts, } from "./types";

const BASE = "http://localhost";

let db: Kysely<DB>;
let ownerId: string;
let worldId: string;
let chatId: string;
let app: Elysia;

/**
 * @param userId
 * @param userRole
 * @returns an app bound to one identity
 */
function appAs(userId: string, userRole = "user",): Elysia {
  return new Elysia({ name: "test-autonomy-routes", },)
    .derive(() => ({ userId, userRole, }))
    .use(autonomyRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

/**
 * @param table worlds or chats
 * @param id row id
 * @param cfg the override blob to store
 */
async function setLayer(table: "worlds" | "chats", id: string, cfg: unknown,): Promise<void> {
  await db.updateTable(table,).set({ autonomy_config: JSON.stringify(cfg,), },).where("id", "=", id,).execute();
}

beforeEach(async () => {
  ({ db, } = await createTestDb());
  ownerId = uid();
  await insertUsers(db, "owner-" + ownerId, "Owner", { id: ownerId, },);
  await insertActors(db, ownerId, { id: ownerId, actor_type: "user", },);
  worldId = uid();
  await insertWorlds(db, ownerId, "Autonomy World", { id: worldId, },);
  chatId = uid();
  await insertChats(db, "chat-" + chatId, ownerId, { id: chatId, world_id: worldId, },);
  await setLayer("worlds", worldId, { preset: "serene", },);
  await setLayer("chats", chatId, { tickIntervalMs: 45000, },);
  app = appAs(ownerId,);
},);

afterEach(async () => {
  await db.destroy();
},);

/** The GET payload, as a settings page consumes it. */
interface AutonomyPayload {
  layers: { world: unknown; chat: unknown; actor: unknown };
  resolved: { preset: string; enabled: boolean; tickIntervalMs: number; perUserCap: number | null };
  presets: Record<string, { tickIntervalMs: number; perAgentCap: number | null }>;
  simulation: { paused: number; tick_count: number; next_tick_at: string };
  budget: { cap: number | null; remaining: number | null; count: number; resetAt: number } | null;

  actors: { id: string; name: string }[];
}

const READ_URL = (id: string, qs: string,) => `${BASE}/api/worlds/${id}/autonomy${qs}`;
const CONTROL_URL = (id: string,) => `${BASE}/api/worlds/${id}/autonomy/control`;

/**
 * @param qs
 * @returns the parsed GET payload
 */
async function readAutonomy(qs = "",): Promise<AutonomyPayload> {
  const res = await app.handle(new Request(READ_URL(worldId, qs,),),);
  expect(res.status,).toBe(200,);
  return await res.json() as AutonomyPayload;
}

/**
 * @param action
 * @returns the raw control response
 */
function control(action: string,): Promise<Response> {
  return app.handle(
    new Request(CONTROL_URL(worldId,), {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({ action, },),
    },),
  );
}

describe("GET /api/worlds/:worldId/autonomy", () => {
  test("returns each layer separately alongside the resolved config", async () => {
    const data = await readAutonomy(`?chatId=${chatId}`,);
    expect(data.layers.world,).toEqual({ preset: "serene", },);
    expect(data.layers.chat,).toEqual({ tickIntervalMs: 45000, },);
    expect(data.resolved.preset,).toBe("serene",);
    expect(data.resolved.tickIntervalMs,).toBe(45000,);
  });

  test("lists the world's characters so the per-actor editor has a picker", async () => {
    const npcId = uid();
    await insertActors(db, "Zara", { id: npcId, actor_type: "character", agent_type: "npc", },);
    await db.insertInto("world_members",).values({ world_id: worldId, actor_id: npcId, },).execute();

    const data = await readAutonomy("",);
    expect(data.actors,).toEqual([{ id: npcId, name: "Zara", },],);
  });

  test("a character from another world is not offered", async () => {
    const otherWorld = uid();
    await insertWorlds(db, ownerId, "Other", { id: otherWorld, },);
    const npcId = uid();
    await insertActors(db, "Vex", { id: npcId, actor_type: "character", agent_type: "npc", },);
    await db.insertInto("world_members",).values({ world_id: otherWorld, actor_id: npcId, },).execute();

    const data = await readAutonomy("",);
    expect(data.actors.map((a,) => a.id),).not.toContain(npcId,);
  });

  test("ships the preset definitions, not just their names", async () => {
    const data = await readAutonomy();
    expect(data.presets.serene?.tickIntervalMs,).toBe(90000,);
    expect(data.presets.brisk?.tickIntervalMs,).toBe(10000,);
  });

  test("includes the persisted simulation cursor", async () => {
    const data = await readAutonomy();
    expect(data.simulation.paused,).toBe(0,);
    expect(data.simulation.tick_count,).toBe(0,);
  });

  test("budget is null when no scope is named", async () => {
    const data = await readAutonomy();
    expect(data.budget,).toBeNull();
  });

  test("reports the budget window without spending it", async () => {
    await setLayer("worlds", worldId, { preset: "serene", perUserCap: 3, },);
    await new AutonomyGovernor().tryConsume(db, { kind: "user", id: ownerId, }, "per_minute_generation", {
      cap: 3,
      chatId,
      nowMs: Date.now(),
    },);
    const data = await readAutonomy(`?scopeKind=user&scopeId=${ownerId}&chatId=${chatId}`,);
    // One consumed, cap 3 leaves two. If the read consumed, this is 1.
    expect(data.budget?.count,).toBe(1,);
    expect(data.budget?.remaining,).toBe(2,);
    expect(data.budget?.cap,).toBe(3,);
    expect(data.budget?.resetAt,).toBeGreaterThan(0,);
  });

  test("an unbounded scope reports null remaining, not a fake number", async () => {
    await setLayer("worlds", worldId, { preset: "serene", perUserCap: null, },);
    const data = await readAutonomy(`?scopeKind=user&scopeId=${ownerId}&chatId=${chatId}`,);
    expect(data.budget?.cap,).toBeNull();
    expect(data.budget?.remaining,).toBeNull();
  });

  test("a non-owner cannot read the caps or the cursor", async () => {
    const strangerId = uid();
    await insertUsers(db, "s-" + strangerId, "S", { id: strangerId, },);
    const res = await appAs(strangerId,).handle(new Request(READ_URL(worldId, "",),),);
    expect(res.status,).toBe(403,);
  });
});

describe("POST /api/worlds/:worldId/autonomy/control", () => {
  test("pause persists and resume clears it", async () => {
    const paused = await control("pause",);
    expect(paused.status,).toBe(200,);
    expect(((await paused.json()) as { paused: number }).paused,).toBe(1,);

    // A fresh app instance reads the DB, not an in-memory flag: this is
    // what a restart looks like.
    const res = await appAs(ownerId,).handle(new Request(READ_URL(worldId, "",),),);
    const after = (await res.json()) as AutonomyPayload;
    expect(after.simulation.paused,).toBe(1,);

    const resumed = await control("resume",);
    expect(((await resumed.json()) as { paused: number }).paused,).toBe(0,);
  });

  test("step forces one tick and leaves the pause intact", async () => {
    await control("pause",);
    const res = await control("step",);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { tick: { worldId: string; nextTickAt: string } };
    expect(body.tick.worldId,).toBe(worldId,);
    expect(body.tick.nextTickAt,).toBeTruthy();

    // The human-in-loop contract: stepping is not resuming.
    const after = await readAutonomy();
    expect(after.simulation.paused,).toBe(1,);
    expect(after.simulation.tick_count,).toBe(1,);
  });

  test("rejects an unknown action rather than defaulting to a tick", async () => {
    const res = await control("tickle",);
    expect(res.status,).toBe(422,);
  });

  test("a non-owner cannot drive the loop", async () => {
    const strangerId = uid();
    await insertUsers(db, "s2-" + strangerId, "S2", { id: strangerId, },);
    const res = await appAs(strangerId,).handle(
      new Request(CONTROL_URL(worldId,), {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ action: "pause", },),
      },),
    );
    expect(res.status,).toBe(403,);
    const after = await readAutonomy();
    expect(after.simulation.paused,).toBe(0,);
  });
});
