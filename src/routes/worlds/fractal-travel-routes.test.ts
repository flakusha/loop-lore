// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/worlds/fractal-travel-routes.test.ts — the travel-route
// endpoints: listing, detail, creation, stops, and transport attachment.
import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertLocations,
  insertTravelRoutes,
  insertTravelRouteStops,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { fractalTravelRoutes, } from "./fractal-travel-routes";
import type { HandleOpts, } from "./types";

describe("fractalTravelRoutes", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;
  let routeId: string;
  let portId: string;
  let transportId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = uid();
    await db
      .insertInto("users",)
      .values({
        id: ownerId,
        username: `user-${ownerId}`,
        display_name: "Owner",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    worldId = uid();
    await insertWorlds(db, ownerId, "Travel World", { id: worldId, } as never,);

    portId = await insertLocations(db, worldId, "Port A",);
    transportId = await insertLocations(db, worldId, "Ferry", {
      kind: "transport",
      mobility_mode: "free",
    },);

    routeId = await insertTravelRoutes(db, worldId, "Ferry Loop", "sea",);
    await insertTravelRouteStops(db, routeId, portId, 0,);
  },);

  /**
   * @param userId - Authenticated user id, or null for an anonymous caller.
   * @param userRole - Role the caller acts with.
   */
  function appWithAuth(userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: "test-worlds-travel-routes", },)
      .derive(() => ({ userId, userRole, }))
      .use(fractalTravelRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
  }

  test("lists the travel routes of a world", async () => {
    const app = appWithAuth(ownerId, "solo",);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/travel-routes`,),);

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.some((route,) => route.id === routeId),).toBe(true,);
  });

  test("returns one route with its stops", async () => {
    const app = appWithAuth(ownerId, "solo",);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/travel-routes/${routeId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { id: string; stops: unknown[] } };
    expect(body.data.id,).toBe(routeId,);
    expect(body.data.stops.length,).toBeGreaterThan(0,);
  });

  test("creates a route, adds a stop to it and removes that stop again", async () => {
    const app = appWithAuth(ownerId, "solo",);
    const created = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/travel-routes`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Road North", kind: "road", waypoints: [portId,], },),
      },),
    );

    expect(created.status,).toBe(201,);
    const { id: newRouteId, } = (await created.json()) as { id: string };

    const stop = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/travel-routes/${newRouteId}/stops`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ locationId: portId, stopOrder: 0, },),
      },),
    );

    expect(stop.status,).toBe(201,);
    const { id: stopId, } = (await stop.json()) as { id: string };

    const removed = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/travel-routes/${newRouteId}/stops/${stopId}`, {
        method: "DELETE",
      },),
    );

    expect(removed.status,).toBe(204,);
  });

  test("attaches a transport to a route and detaches it again", async () => {
    const app = appWithAuth(ownerId, "solo",);
    const attached = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/travel-routes/${routeId}/attach/${transportId}`, {
        method: "POST",
      },),
    );

    expect(attached.status,).toBe(200,);

    const detached = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/travel-routes/${routeId}/attach/${transportId}`, {
        method: "DELETE",
      },),
    );

    expect(detached.status,).toBe(204,);
  });

  test("a stop delete for a route outside the world is refused", async () => {
    const app = appWithAuth(ownerId, "solo",);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/travel-routes/${uid()}/stops/${uid()}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("an anonymous caller cannot list the routes of a private world", async () => {
    const app = appWithAuth(null, null,);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/travel-routes`,),);

    expect([401, 404,],).toContain(res.status,);
  });
});
