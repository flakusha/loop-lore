// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorCurrencies,
  insertActors,
  insertLocationEdges,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { locationEdgeRoutes, } from "./location-edges";
import type { HandleOpts, } from "./types";

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-worlds-location-edges", },)
    .derive(() => ({ userId, userRole, }))
    .use(locationEdgeRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

let db: Kysely<DB>;
let sqlite: Database;
let ownerId: string;
let playerId: string;
let ownerActorId: string;

/** Fresh world + location pair, so tests never share edge rows. */
async function sandbox(): Promise<{ worldId: string; a: string; b: string }> {
  const worldId = randomUUID();
  await insertWorlds(db, ownerId, `edges-${worldId.slice(0, 8,)}`, { id: worldId, visibility: "public", },);
  const a = await insertLocations(db, worldId, "Alpha",);
  const b = await insertLocations(db, worldId, "Beta",);
  return { worldId, a, b, };
}

/**
 * @param app
 * @param worldId
 * @param fromId
 * @param body
 * @returns POST travel response
 */
function travel(app: Elysia, worldId: string, fromId: string, body: Record<string, unknown>,): Promise<Response> {
  return app.handle(
    new Request(`${BASE}/api/worlds/${worldId}/locations/${fromId}/travel`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, sqlite, } = await createTestDb());

  ownerId = randomUUID();
  playerId = randomUUID();
  await insertUsers(db, "edge-owner", "Owner", { id: ownerId, role: "solo", },);
  await insertUsers(db, "edge-player", "Player", { id: playerId, role: "player", },);

  ownerActorId = await insertActors(db, "owner-actor", {
    id: randomUUID(),
    user_id: ownerId,
    owner_id: ownerId,
  },);
},);

afterAll(async () => {
  sqlite.close();
},);

describe("POST /worlds/:worldId/locations/:locId/edges", () => {
  test("non-owner is rejected with 403", async () => {
    const { worldId, a, b, } = await sandbox();
    const app = appWithAuth(db, playerId, "player",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${a}/edges`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ toId: b, mode: "walk", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });

  test("owner creates an edge; self pair and duplicates are 400", async () => {
    const { worldId, a, b, } = await sandbox();
    const app = appWithAuth(db, ownerId, "solo",);

    const created = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${a}/edges`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ toId: b, mode: "walk", gameHours: 3, },),
      },),
    );

    expect(created.status,).toBe(201,);
    const body = (await created.json()) as {
      from_id: string;
      to_id: string;
      game_hours: number;
      requires_discovery: boolean;
    };

    expect(body.from_id,).toBe(a,);
    expect(body.to_id,).toBe(b,);
    expect(body.game_hours,).toBe(3,);
    expect(body.requires_discovery,).toBe(false,);

    const dupe = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${a}/edges`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ toId: b, mode: "walk", },),
      },),
    );

    expect(dupe.status,).toBe(400,);

    const self = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${a}/edges`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ toId: a, mode: "walk", },),
      },),
    );

    expect(self.status,).toBe(400,);
  });
});

describe("PUT/DELETE /worlds/:worldId/edges/:edgeId", () => {
  test("owner updates and deletes; missing edge is 404", async () => {
    const { worldId, a, b, } = await sandbox();
    const app = appWithAuth(db, ownerId, "solo",);
    const edgeId = await insertLocationEdges(db, worldId, a, b,);

    const patched = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/edges/${edgeId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ gameHours: 9, },),
      },),
    );

    expect(patched.status,).toBe(200,);
    expect(((await patched.json()) as { game_hours: number }).game_hours,).toBe(9,);

    const gone = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/edges/${randomUUID()}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ gameHours: 1, },),
      },),
    );

    expect(gone.status,).toBe(404,);

    const removed = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/edges/${edgeId}`, { method: "DELETE", },),
    );

    expect(removed.status,).toBe(204,);

    const again = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/edges/${edgeId}`, { method: "DELETE", },),
    );

    expect(again.status,).toBe(404,);
  });
});

describe("GET /worlds/:worldId/edges discovery filtering", () => {
  test("hides locked edges from players until both endpoints are force-discovered", async () => {
    const { worldId, a, b, } = await sandbox();
    const lockedId = await insertLocationEdges(db, worldId, a, b, { requires_discovery: 1, },);
    const actorId = await insertActors(db, "graph-actor", {
      id: randomUUID(),
      user_id: playerId,
      owner_id: playerId,
    },);

    const playerApp = appWithAuth(db, playerId, "player",);
    const before = await playerApp.handle(new Request(`${BASE}/api/worlds/${worldId}/edges`,),);
    expect(before.status,).toBe(200,);
    expect(((await before.json()) as { data: { id: string }[] }).data.map((e,) => e.id),).not.toContain(
      lockedId,
    );

    const ownerApp = appWithAuth(db, ownerId, "solo",);
    const unlock = async (locId: string,): Promise<Response> =>
      await ownerApp.handle(
        new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}/discover`, {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ actorId, },),
        },),
      );

    expect((await unlock(a,)).status,).toBe(200,);
    const halfOpen = await playerApp.handle(new Request(`${BASE}/api/worlds/${worldId}/edges`,),);
    expect(((await halfOpen.json()) as { data: { id: string }[] }).data.map((e,) => e.id),).not.toContain(
      lockedId,
    );

    expect((await unlock(b,)).status,).toBe(200,);

    const after = await playerApp.handle(new Request(`${BASE}/api/worlds/${worldId}/edges`,),);
    expect(((await after.json()) as { data: { id: string }[] }).data.map((e,) => e.id),).toContain(lockedId,);
  });
});

describe("POST /worlds/:worldId/locations/:locId/travel", () => {
  test("walk hop moves the actor; locked edge is 404 until bypassed by the owner", async () => {
    const { worldId, a, b, } = await sandbox();
    const edgeId = await insertLocationEdges(db, worldId, a, b, { mode: "walk", requires_discovery: 1, },);
    await insertActors(db, "walk-actor", {
      id: randomUUID(),
      user_id: playerId,
      owner_id: playerId,
    },);

    const playerApp = appWithAuth(db, playerId, "player",);
    const locked = await travel(playerApp, worldId, a, { toId: b, mode: "walk", },);
    expect(locked.status,).toBe(404,);

    const ownerApp = appWithAuth(db, ownerId, "solo",);
    const bypassed = await travel(ownerApp, worldId, a, { toId: b, mode: "walk", },);
    expect(bypassed.status,).toBe(200,);
    const outcome = (await bypassed.json()) as { toId: string; goldCharged: number | null; actorId: string };
    expect(outcome.toId,).toBe(b,);
    expect(outcome.goldCharged,).toBeNull();
    expect(outcome.actorId,).toBe(ownerActorId,);

    const placed = (await db
      .selectFrom("actor_locations",)
      .selectAll()
      .where("actor_id", "=", ownerActorId,)
      .executeTakeFirstOrThrow()) as unknown as { physical_location_id: string };

    expect(placed.physical_location_id,).toBe(b,);
    expect(edgeId,).not.toBe("",);
  });

  test("free-jump charges gold and the second hop inside the cooldown is 400", async () => {
    const { worldId, a, b, } = await sandbox();
    await insertLocationEdges(db, worldId, a, b, {
      mode: "free-jump",
      cost_json: JSON.stringify({ gold: 2, cooldownHours: 1, },),
    },);

    const actorId = await insertActors(db, "jump-actor", { id: randomUUID(), user_id: playerId, owner_id: playerId, },);
    await insertActorCurrencies(db, actorId, worldId, "gold", { balance: 5, },);

    const app = appWithAuth(db, playerId, "player",);
    const first = await travel(app, worldId, a, { toId: b, mode: "free-jump", actorId, },);
    expect(first.status,).toBe(200,);
    expect(((await first.json()) as { goldCharged: number }).goldCharged,).toBe(2,);

    const wallet = (await db
      .selectFrom("actor_currencies",)
      .select("balance",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow()) as unknown as { balance: number };

    expect(wallet.balance,).toBe(3,);

    const second = await travel(app, worldId, a, { toId: b, mode: "free-jump", actorId, },);
    expect(second.status,).toBe(400,);
  });
});
