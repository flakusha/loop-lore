/**
 * Tests for location-explorer routes — explorer tree data + enriched detail.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertLocations,
  insertLocationStates,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { safeJsonStringify, uid, } from "../utils";
import { locationExplorerRoutes, } from "./location-explorer";

const USER_ROLE = "solo";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function createApp(db: Kysely<DB>, userId: string | null, userRole: string = USER_ROLE,): Elysia {
  return new Elysia({ name: "test-loc-explorer", },)
    .derive(() => ({ userId, userRole, }))
    .use(locationExplorerRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param userId
 */
async function insertUser(db: Kysely<DB>, userId: string,): Promise<void> {
  await db
    .insertInto("users",)
    .values({
      id: userId,
      username: `explorer-${userId}`,
      display_name: "Explorer User",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();
  await db
    .insertInto("actors",)
    .values({
      id: userId,
      actor_type: "user",
      display_name: "Explorer User",
      user_id: userId,
      owner_id: userId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

describe("locationExplorerRoutes", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let locTavern: string;
  let locCave: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();

    await insertUser(db, userId,);
    await insertWorlds(db, userId, "Explorer World", {},);
    worldId = (await db.selectFrom("worlds",).select("id",).where("owner_id", "=", userId,).executeTakeFirst())!.id;
    await insertLocations(db, worldId, "Tavern", { description: "Cozy", },);
    locTavern = (await db.selectFrom("locations",).select("id",).where("name", "=", "Tavern",).executeTakeFirst())!.id;
    await insertLocations(db, worldId, "Cave", { parent_location_id: locTavern, },);
    locCave = (await db.selectFrom("locations",).select("id",).where("name", "=", "Cave",).executeTakeFirst())!.id;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("location-explorer returns all locations + states for a world", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/location-explorer`,),);
    expect(res.status,).toBe(200,);
    const locations = (await res.json()).data.locations as { name: string; parent_location_id: string | null }[];
    expect(locations.map((l,) => l.name),).toEqual(expect.arrayContaining(["Tavern", "Cave",],),);
    const cave = locations.find((l,) => l.name === "Cave");
    expect(cave?.parent_location_id,).toBe(locTavern,);
  });

  test("location detail enriches connections + parent + state", async () => {
    const enc = safeJsonStringify([locCave,],);
    if (!enc.ok) { throw enc.error; }
    await db
      .updateTable("locations",)
      .set({ connections: enc.value, },)
      .where("id", "=", locTavern,)
      .execute();
    await insertLocationStates(db, locTavern, worldId, { atmosphere: "warm", description_override: "Lively tavern", },);

    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/locations/${locTavern}/details`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()).data;

    expect(body.name,).toBe("Tavern",);
    expect(body.state?.atmosphere,).toBe("warm",);
    expect(body.connections,).toEqual([expect.objectContaining({ id: locCave, name: "Cave", },),],);
    expect(body.parent,).toBeNull();
  });

  test("non-owner cannot read explorer (404)", async () => {
    const other = uid();
    await insertUser(db, other,);
    const app = createApp(db, other, "user",);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/location-explorer`,),);
    expect(res.status,).toBe(404,);
  });

  test("unauthenticated request is 401", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/location-explorer`,),);
    expect(res.status,).toBe(401,);
  });
});
