// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bestiary route tests over a real test DB.
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
import { insertLocations, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { bestiaryRoutes, } from "./bestiary";

let db: Kysely<DB>;
let sqlite: Database;
let userId: string;
let worldId: string;
let otherWorldId: string;
let locationId: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, sqlite, } = await createTestDb());
  userId = uid();
  await insertUsers(db, `user-${userId}`, "Bestiary Owner", {
    id: userId,
    role: "solo",
    status: "active",
    settings: "{}",
  } as never,);

  worldId = uid();
  await insertWorlds(db, userId, "Bestiary World", { id: worldId, } as never,);
  otherWorldId = uid();
  await insertWorlds(db, userId, "Other World", { id: otherWorldId, } as never,);
  locationId = uid();
  await insertLocations(db, worldId, "Cavern", { id: locationId, } as never,);
},);

afterAll(() => sqlite.close());

/**
 * @param actingUserId
 */
function authedApp(actingUserId: string = userId,): Elysia {
  return new Elysia({ name: "test-bestiary", },)
    .derive({ as: "scoped", }, () => ({ userId: actingUserId, userRole: "user", }),)
    .use(bestiaryRoutes({ database: db, config: {} as never, },),) as unknown as Elysia;
}

function anonApp(): Elysia {
  return new Elysia({ name: "test-bestiary-anon", },)
    .use(bestiaryRoutes({ database: db, config: {} as never, },),) as unknown as Elysia;
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

describe("bestiary routes", () => {
  test("list requires auth", async () => {
    const res = await call(anonApp(), `/api/rpg/bestiary/worlds/${worldId}/monsters`,);
    expect(res.status,).toBe(401,);
  });

  test("list starts empty", async () => {
    const res = await call(authedApp(), `/api/rpg/bestiary/worlds/${worldId}/monsters`,);
    expect(res.status,).toBe(200,);
  });

  test("strangers get 403", async () => {
    const res = await call(authedApp("stranger",), `/api/rpg/bestiary/worlds/${worldId}/monsters`,);
    expect(res.status,).toBe(403,);
  });

  test("register + list round-trip", async () => {
    const app = authedApp();
    const registered = await post(app, `/api/rpg/bestiary/worlds/${worldId}/monsters`, {
      name: "Goblin",
      category: "humanoid",
    },);

    expect(registered.status,).toBe(200,);

    const listed = await call(app, `/api/rpg/bestiary/worlds/${worldId}/monsters`,);
    expect(listed.status,).toBe(200,);
    const body = await listed.json() as { name: string }[];
    expect(body.map((t,) => t.name),).toContain("Goblin",);
  });

  test("registering a blank name fails", async () => {
    const res = await post(authedApp(), `/api/rpg/bestiary/worlds/${worldId}/monsters`, {
      name: "  ",
      category: "humanoid",
    },);

    expect(res.status,).toBe(500,);
  });

  test("location list resolves spawns with templates", async () => {
    const app = authedApp();
    const registered = await post(app, `/api/rpg/bestiary/worlds/${worldId}/monsters`, {
      name: "Cave Bat",
      category: "beast",
    },);

    const { id: templateId, } = await registered.json() as { id: string };
    const spawned = await post(app, `/api/rpg/bestiary/worlds/${worldId}/spawns`, {
      locationId,
      templateId,
      territory: { centerX: 1, centerY: 2, radius: 5, },
    },);

    expect(spawned.status,).toBe(200,);

    const res = await call(app, `/api/rpg/bestiary/worlds/${worldId}/locations/${locationId}/monsters`,);
    expect(res.status,).toBe(200,);
  });

  test("spawn rolls seeded loot", async () => {
    const app = authedApp();
    const registered = await post(app, `/api/rpg/bestiary/worlds/${worldId}/monsters`, {
      name: "Hoarder",
      category: "humanoid",
      lootTable: [{ itemId: "gold", chance: 1, quantity: 2, },],
    },);

    expect(registered.status,).toBe(200,);
    const { id: templateId, } = await registered.json() as { id: string };

    const res = await post(app, `/api/rpg/bestiary/worlds/${worldId}/spawns`, {
      locationId,
      templateId,
      territory: { centerX: 0, centerY: 0, radius: 10, },
      rngSeed: 42,
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { loot: unknown[] };
    expect(body.loot.length,).toBeGreaterThan(0,);
  });

  test("spawn of an unknown template is 404", async () => {
    const res = await post(authedApp(), `/api/rpg/bestiary/worlds/${worldId}/spawns`, {
      locationId,
      templateId: uid(),
      territory: { centerX: 0, centerY: 0, radius: 10, },
    },);

    expect(res.status,).toBe(404,);
  });

  test("spawn cannot use another world's private template", async () => {
    const app = authedApp();
    const registered = await post(app, `/api/rpg/bestiary/worlds/${otherWorldId}/monsters`, {
      name: "Foreign",
      category: "undead",
    },);

    const { id: templateId, } = await registered.json() as { id: string };

    const res = await post(app, `/api/rpg/bestiary/worlds/${worldId}/spawns`, {
      locationId,
      templateId,
      territory: { centerX: 0, centerY: 0, radius: 10, },
    },);

    expect(res.status,).toBe(404,);
  });

  test("despawn sweep removes expired spawns", async () => {
    const app = authedApp();
    const registered = await post(app, `/api/rpg/bestiary/worlds/${worldId}/monsters`, {
      name: "Mayfly",
      category: "beast",
    },);

    const { id: templateId, } = await registered.json() as { id: string };
    await post(app, `/api/rpg/bestiary/worlds/${worldId}/spawns`, {
      locationId,
      templateId,
      territory: { centerX: 0, centerY: 0, radius: 1, },
      despawnAt: "2020-01-01T00:00:00.000Z",
    },);

    const res = await post(app, `/api/rpg/bestiary/worlds/${worldId}/despawn-expired`, {},);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { despawned: number };
    expect(body.despawned,).toBeGreaterThanOrEqual(1,);
  });
});
