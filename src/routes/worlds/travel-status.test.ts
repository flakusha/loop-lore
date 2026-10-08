/**
 * Tests for routes/worlds/travel-status.ts — the travel interface feed
 * (TASK-travel-interface): active transports with route progress + next
 * stop, parties (fast-travel state), and location hazards.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertLocations,
  insertLocationStates,
  insertTravelParties,
  insertTravelRoutes,
  insertTravelRouteStops,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { loadTravelStatus, travelStatusRoutes, } from "./travel-status";
import type { HandleOpts, } from "./types";

describe("loadTravelStatus", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;
  let shipId: string;
  let portAId: string;
  let portBId: string;

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

    portAId = await insertLocations(db, worldId, "Port A",);
    portBId = await insertLocations(db, worldId, "Port B",);
    const routeId = await insertTravelRoutes(db, worldId, "Ferry Loop", "sea",);
    await insertTravelRouteStops(db, routeId, portAId, 0,);
    await insertTravelRouteStops(db, routeId, portBId, 1,);

    // A transport mid-route (progress 0.5 → between stop 0 and 1).
    shipId = await insertLocations(db, worldId, "Ferry", {
      kind: "transport",
      mobility_mode: "free",
      current_route_id: routeId,
      travel_progress: 0.5,
    },);

    await insertLocationStates(db, shipId, worldId, {
      hazards: JSON.stringify(["rough seas",],),
    },);

    // A parked party (fast-travel state = resting at Port A).
    await insertTravelParties(db, worldId, "The Fellowship", {
      status: "resting",
      route_index: 0,
      travel_progress: 0,
      current_location_id: portAId,
    },);
  },);

  test("aggregates transport progress, next stop and hazards", async () => {
    const status = await loadTravelStatus(db, worldId,);

    expect(status.transports,).toHaveLength(1,);
    const ferry = status.transports[0]!;
    expect(ferry.locationId,).toBe(shipId,);
    expect(ferry.name,).toBe("Ferry",);
    expect(ferry.routeName,).toBe("Ferry Loop",);
    expect(ferry.stopCount,).toBe(2,);
    expect(ferry.progress,).toBe(0.5,);
    expect(ferry.loop,).toBe(false,);
    // floor(0.5) = 0 → next stop is Port A.
    expect(ferry.nextStopName,).toBe("Port A",);
    expect(ferry.hazards,).toEqual(["rough seas",],);
  });

  test("aggregates party fast-travel state with current location + hazards", async () => {
    const status = await loadTravelStatus(db, worldId,);

    expect(status.parties,).toHaveLength(1,);
    const party = status.parties[0]!;
    expect(party.name,).toBe("The Fellowship",);
    expect(party.status,).toBe("resting",);
    expect(party.routeIndex,).toBe(0,);
    expect(party.currentLocationId,).toBe(portAId,);
    expect(party.currentLocationName,).toBe("Port A",);
  });

  test("a world without travel returns empty lists", async () => {
    const emptyWorldId = uid();
    await insertWorlds(db, ownerId, "Still World", { id: emptyWorldId, } as never,);
    const status = await loadTravelStatus(db, emptyWorldId,);
    expect(status.transports,).toEqual([],);
    expect(status.parties,).toEqual([],);
  });
});

describe("travelStatusRoutes", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;

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
    await insertWorlds(db, ownerId, "Route World", { id: worldId, } as never,);
  },);

  /**
   * @param dbArg
   * @param userId
   * @param userRole
   */
  function appWithAuth(dbArg: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: "test-worlds-travel-status", },)
      .derive(() => ({ userId, userRole, }))
      .use(travelStatusRoutes({ database: dbArg, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
  }

  test("returns the status payload for the owner", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/travel/status`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { transports: unknown[]; parties: unknown[] } };
    expect(body.data.transports,).toEqual([],);
    expect(body.data.parties,).toEqual([],);
  });

  test("anonymous access to a private world is rejected", async () => {
    const app = appWithAuth(db, null, null,);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/travel/status`,),);
    expect([401, 404,],).toContain(res.status,);
  });
});
