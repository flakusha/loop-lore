// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for src/routes/nsfw/location.ts — covers GET and PUT
 * /api/nsfw/location/:locationId.
 *
 * Edge classes: unauthenticated (401), NSFW disabled (403), default config
 * auto-creation, config update persistence, and partial atmosphere/risks
 * merge semantics.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { resetNsfwRuntimeConfig, } from "../../nsfw/runtime-config";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { locationRoutes, } from "./location";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(() => {
  // The location service mutators assert against the runtime-config singleton;
  // reset it so a sibling suite's allowNsfw=false cannot leak into these tests.
  resetNsfwRuntimeConfig();
},);

/**
 * Build an NSFW config fixture (only the nsfw section is read by the gate).
 * @param overrides
 */
function makeConfig(overrides: Partial<Config["nsfw"]> = {},): Config {
  return {
    nsfw: new NsfwSection(overrides,),
  } as unknown as Config;
}

/** Insert a canonical authorised user (unique per call). */
async function seedUser(id: string,): Promise<string> {
  const userId = `location-test-user-${id}`;
  await insertUsers(db, userId, `Location Test User ${id}`, {
    id: userId as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);
  return userId;
}

/** Insert a world + location pair (location_nsfw_config has an FK to locations.id). */
async function seedLocation(id: string,): Promise<string> {
  const userId = `location-test-user-${id}`;
  const worldId = `location-test-world-${id}`;
  const locationId = `loc-${id}`;
  await insertUsers(db, userId, `Location Test User ${id}`, {
    id: userId as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);
  await insertWorlds(db, userId, `Location Test World ${id}`, { id: worldId as never, },);
  await insertLocations(db, worldId, `Location ${id}`, { id: locationId as never, },);
  return locationId;
}

/**
 * @param userId optional authenticated user
 * @param config
 */
function makeApp(userId?: string, config: Config = makeConfig(),) {
  const app = new Elysia({ name: "test-location", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(locationRoutes({ database: db, config, },),);
}

describe("location routes — GET /api/nsfw/location/:locationId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/location/loc-x",),
    );
    expect(res.status,).toBe(401,);
  });

  test("authenticated → 200 with default config (auto-created)", async () => {
    const locationId = await seedLocation("get",);
    const userId = `location-test-user-get`;
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/location/${locationId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.locationId,).toBe(locationId,);
    expect(body.locationType,).toBe("bedroom",);
    expect(body.privacyLevel,).toBe("private",);
    expect(body.discoveryChance,).toBe(10,);

    const row = await db
      .selectFrom("location_nsfw_config",)
      .select("privacy_level",)
      .where("location_id", "=", locationId,)
      .executeTakeFirst();
    expect(row?.privacy_level,).toBe("private",);
  });

  test("NSFW disabled → 403", async () => {
    const userId = await seedUser("getdisabled",);
    const res = await makeApp(userId, makeConfig({ allowNsfw: false, },),).handle(
      new Request("http://localhost/api/nsfw/location/loc-get-2",),
    );
    expect(res.status,).toBe(403,);
  });
});

describe("location routes — PUT /api/nsfw/location/:locationId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/location/loc-x", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ privacyLevel: "public", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("authenticated updates config → 200, DB persisted", async () => {
    const locationId = await seedLocation("put",);
    const userId = `location-test-user-put`;
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/location/${locationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          privacyLevel: "public",
          locationType: "tavern",
          discoveryChance: 50,
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success,).toBe(true,);

    const row = await db
      .selectFrom("location_nsfw_config",)
      .select(["privacy_level", "location_type", "discovery_chance",],)
      .where("location_id", "=", locationId,)
      .executeTakeFirst();
    expect(row?.privacy_level,).toBe("public",);
    expect(row?.location_type,).toBe("tavern",);
    expect(row?.discovery_chance,).toBe(50,);
  });

  test("partial atmosphere update merges with existing defaults", async () => {
    const locationId = await seedLocation("putatmo",);
    const userId = `location-test-user-putatmo`;
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/location/${locationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ atmosphere: { romantic: 90, }, },),
      },),
    );
    expect(res.status,).toBe(200,);

    const row = await db
      .selectFrom("location_nsfw_config",)
      .select("atmosphere",)
      .where("location_id", "=", locationId,)
      .executeTakeFirst();
    const atmosphere = JSON.parse(row?.atmosphere ?? "{}",) as Record<string, number>;
    expect(atmosphere.romantic,).toBe(90,);
    // Untouched keys keep their defaults.
    expect(atmosphere.comfortable,).toBe(50,);
  });

  test("NSFW disabled → 403", async () => {
    const userId = await seedUser("putdisabled",);
    const res = await makeApp(userId, makeConfig({ allowNsfw: false, },),).handle(
      new Request("http://localhost/api/nsfw/location/loc-put-3", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ privacyLevel: "public", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });
});
