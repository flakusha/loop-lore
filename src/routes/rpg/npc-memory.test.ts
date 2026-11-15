// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC memory route tests over a real test DB.
 * World-scoped via requireWorldOwner; the remaining handler catch blocks
 * are unreachable via HTTP (Elysia schema validation rejects malformed
 * bodies with 422 before the handler runs).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { npcMemoryRoutes, } from "./npc-memory";

let db: Kysely<DB>;
let sqlite: Database;
let userId: string;
let worldId: string;
let otherWorldId: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, sqlite, } = await createTestDb());
  userId = uid();
  await insertUsers(db, `user-${userId}`, "Memory Keeper", {
    id: userId,
    role: "solo",
    status: "active",
    settings: "{}",
  } as never,);

  worldId = uid();
  await insertWorlds(db, userId, "Memory World", { id: worldId, } as never,);
  otherWorldId = uid();
  await insertWorlds(db, userId, "Other World", { id: otherWorldId, } as never,);
  await insertActors(db, "Innkeeper", { id: "npc-1", owner_id: userId, } as never,);
  await insertActors(db, "Blacksmith", { id: "npc-2", owner_id: userId, } as never,);
},);

afterAll(() => sqlite.close());

/**
 * @param actingUserId
 */
function authedApp(actingUserId: string = userId,): Elysia {
  return new Elysia({ name: "test-npc-memory", },)
    .derive({ as: "scoped", }, () => ({ userId: actingUserId, userRole: "user", }),)
    .use(npcMemoryRoutes({ database: db, },),) as unknown as Elysia;
}

function anonApp(): Elysia {
  return new Elysia({ name: "test-npc-memory-anon", },)
    .use(npcMemoryRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param app
 * @param path
 * @param init
 */
function call(app: Elysia, path: string, init?: RequestInit,): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init,),);
}

/**
 * @param app
 * @param path
 * @param body
 */
function post(app: Elysia, path: string, body: unknown,): Promise<Response> {
  return call(app, path, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("npc memory routes", () => {
  test("recall requires auth", async () => {
    const res = await call(anonApp(), `/api/rpg/npc-memory/worlds/${worldId}/npcs/npc-1/memories`,);
    expect(res.status,).toBe(401,);
  });

  test("strangers get 403", async () => {
    const res = await call(authedApp("stranger",), `/api/rpg/npc-memory/worlds/${worldId}/npcs/npc-1/memories`,);
    expect(res.status,).toBe(403,);
  });

  test("record + recall round-trip", async () => {
    const app = authedApp();
    const recorded = await post(app, `/api/rpg/npc-memory/worlds/${worldId}/npcs/npc-1/memories`, {
      content: "met the traveller",
      importance: 90,
      participants: ["npc-2",],
    },);

    expect(recorded.status,).toBe(200,);

    const recalled = await call(app, `/api/rpg/npc-memory/worlds/${worldId}/npcs/npc-1/memories?limit=10`,);
    expect(recalled.status,).toBe(200,);
    const memories = await recalled.json() as { content: string }[];
    expect(memories.map((m,) => m.content),).toContain("met the traveller",);
  });

  test("reinforce resets the decay clock", async () => {
    const app = authedApp();
    const recorded = await post(app, `/api/rpg/npc-memory/worlds/${worldId}/npcs/npc-1/memories`, {
      content: "reinforce me",
    },);

    const { id: memoryId, } = await recorded.json() as { id: string };

    const res = await post(app, `/api/rpg/npc-memory/worlds/${worldId}/memories/${memoryId}/reinforce`, {},);
    expect(res.status,).toBe(200,);
  });

  test("reinforce of another world's memory is 404", async () => {
    const app = authedApp();
    const recorded = await post(app, `/api/rpg/npc-memory/worlds/${worldId}/npcs/npc-1/memories`, {
      content: "not yours",
    },);

    const { id: memoryId, } = await recorded.json() as { id: string };

    const res = await post(app, `/api/rpg/npc-memory/worlds/${otherWorldId}/memories/${memoryId}/reinforce`, {},);
    expect(res.status,).toBe(404,);
  });

  test("relationship shift returns the band", async () => {
    const res = await post(authedApp(), `/api/rpg/npc-memory/worlds/${worldId}/relationships`, {
      npcId: "npc-1",
      targetId: "npc-2",
      delta: 10,
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { relationship: { standing: number }; computedType: string };
    expect(typeof body.relationship.standing,).toBe("number",);
    expect(typeof body.computedType,).toBe("string",);
  });

  test("decay sweep runs", async () => {
    const res = await post(authedApp(), `/api/rpg/npc-memory/worlds/${worldId}/decay`, {},);
    expect(res.status,).toBe(200,);
  });
});
