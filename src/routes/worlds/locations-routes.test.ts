import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { seedChatSetupTemplates, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import { createLogger, } from "../../logger";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertLocations, insertLocationStates, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { locationRoutes, } from "./locations-routes";
import type { HandleOpts, } from "./types";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-worlds-locations", },)
    .derive(() => ({ userId, userRole, }))
    .use(locationRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("locationRoutes — delete + connections validation (BUG-location-*)", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    await seedChatSetupTemplates(db,);

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
    // Location auto-chat inserts userId as actor_id in chat_participants
    // (FK → actors.id) — user must have a matching actor row.
    await db
      .insertInto("actors",)
      .values({
        id: ownerId,
        actor_type: "user",
        display_name: "Owner",
        user_id: ownerId,
        owner_id: ownerId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    sqlite.close();
  },);

  /**
   * @param app
   * @param body
   */
  async function createLocationViaApi(app: Elysia, worldId: string, body: Record<string, unknown>,): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
    const parsed = (await res.json()) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { status: res.status, body: {}, };
    }
    return { status: res.status, body: parsed as Record<string, unknown>, };
  }

  test("2.7: DELETE removes location_states first (no FK 500)", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Tavern World", { id: worldId, } as never,);

    const created = await createLocationViaApi(app, worldId, { name: "Tavern", },);
    expect(created.status,).toBe(201,);
    const locId = created.body.id as string;

    // Seed a location_states row for it (as world-state init would).
    await insertLocationStates(db, locId, worldId,);

    const delRes = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}`, { method: "DELETE", },),
    );
    expect(delRes.status,).toBe(204,);

    const states = await db
      .selectFrom("location_states",)
      .select("id",)
      .where("location_id", "=", locId,)
      .execute();
    expect(states,).toHaveLength(0,);

    const loc = await db
      .selectFrom("locations",)
      .select("id",)
      .where("id", "=", locId,)
      .executeTakeFirst();
    expect(loc,).toBeUndefined();
  });

  test("2.8: connections with non-string entries are rejected with 400", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Reject World", { id: worldId, } as never,);

    const created = await createLocationViaApi(app, worldId, { name: "Crossroads", connections: [123, {},], },);
    expect(created.status,).toBe(400,);
    expect(String(created.body.error ?? ""),).toContain("strings",);

    // Nothing persisted.
    const count = await db
      .selectFrom("locations",)
      .select(db.fn.countAll<number>().as("total",),)
      .where("name", "=", "Crossroads",)
      .executeTakeFirst();
    expect(count?.total,).toBe(0,);
  });

  test("2.8: valid string connections persist as JSON strings only", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Bridge World", { id: worldId, } as never,);

    // Seed a second location to connect to.
    const otherId = uid();
    await insertLocations(db, worldId, "Forest", { id: otherId, } as never,);

    const created = await createLocationViaApi(app, worldId, { name: "Bridge", connections: [otherId,], },);
    expect(created.status,).toBe(201,);
    const locId = created.body.id as string;

    const row = await db
      .selectFrom("locations",)
      .select("connections",)
      .where("id", "=", locId,)
      .executeTakeFirst();
    expect(row?.connections,).toBe(JSON.stringify([otherId,],),);
    // Stored value must round-trip as strings only.
    const stored = JSON.parse(row?.connections ?? "[]") as unknown[];
    expect(stored.every((c,) => typeof c === "string",),).toBe(true,);
  });
});