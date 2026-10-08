/**
 * Tests for the location move route (POST .../locations/:locId/move).
 * TASK-location-crud-tree-connections: subtree moves must go through
 * LocationTreeService.moveSubtree so cycles, self-parents and cross-world
 * parents are rejected at the app layer instead of wedging the path trigger.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { seedChatSetupTemplates, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertLocations, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { locationRoutes, } from "./locations-routes";
import type { HandleOpts, } from "./types";

const BASE = "http://localhost";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-worlds-locations-move", },)
    .derive(() => ({ userId, userRole, }))
    .use(locationRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("POST /worlds/:worldId/locations/:locId/move", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let worldId: string;
  let rootId: string;
  let root2Id: string;
  let childId: string;
  let grandchildId: string;

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

    worldId = uid();
    await insertWorlds(db, ownerId, "Move World", { id: worldId, } as never,);

    rootId = await insertLocations(db, worldId, "Root",);
    root2Id = await insertLocations(db, worldId, "Root Two",);
    childId = await insertLocations(db, worldId, "Child", { parent_location_id: rootId, },);
    grandchildId = await insertLocations(db, worldId, "Grandchild", { parent_location_id: childId, },);
  },);

  afterAll(async () => {
    sqlite.close();
  },);

  /**
   * @param app
   * @param locId
   * @param newParentId
   */
  async function move(
    app: Elysia,
    locId: string,
    newParentId: string | null,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}/move`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newParentId, },),
      },),
    );

    const parsed = (await res.json()) as unknown;
    return {
      status: res.status,
      body: parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {},
    };
  }

  test("moves a subtree under a new parent and repairs paths", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const result = await move(app, childId, root2Id,);
    expect(result.status,).toBe(200,);

    // child now hangs under Root Two; the DB trigger materialized the new path.
    const child = await db.selectFrom("locations",).selectAll().where("id", "=", childId,).executeTakeFirst();
    expect(child?.parent_location_id,).toBe(root2Id,);
    expect(child?.path,).toBe(`/${root2Id}/${childId}/`,);

    // Move it back for the later tests.
    const restore = await move(app, childId, rootId,);
    expect(restore.status,).toBe(200,);
  });

  test("moving a location under itself is rejected with 400", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const result = await move(app, childId, childId,);
    expect(result.status,).toBe(400,);
  });

  test("moving a location under its own descendant is rejected with 400 (cycle)", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const result = await move(app, rootId, grandchildId,);
    expect(result.status,).toBe(400,);
    expect(String(result.body.error ?? result.body.message ?? "",),).toContain("cycle",);
  });

  test("cross-world move is rejected with 400", async () => {
    const otherOwnerId = uid();
    await db
      .insertInto("users",)
      .values({
        id: otherOwnerId,
        username: `user-${otherOwnerId}`,
        display_name: "Other",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const otherWorldId = uid();
    await insertWorlds(db, otherOwnerId, "Other World", { id: otherWorldId, } as never,);
    const foreignId = await insertLocations(db, otherWorldId, "Foreign",);

    const app = appWithAuth(db, ownerId, "solo",);
    const result = await move(app, childId, foreignId,);
    expect(result.status,).toBe(400,);
  });

  test("moving a missing location returns 404", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const result = await move(app, uid(), rootId,);
    expect(result.status,).toBe(404,);
  });

  test("moving under a missing parent returns 404", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const result = await move(app, childId, uid(),);
    expect(result.status,).toBe(404,);
  });

  test("non-owner cannot move locations", async () => {
    const intruderId = uid();
    await db
      .insertInto("users",)
      .values({
        id: intruderId,
        username: `user-${intruderId}`,
        display_name: "Intruder",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const app = appWithAuth(db, intruderId, "user",);
    const result = await move(app, childId, rootId,);
    expect(result.status,).toBe(403,);
  });

  test("unauthenticated move is rejected", async () => {
    const app = appWithAuth(db, null, null,);
    const result = await move(app, childId, rootId,);
    expect([401, 403, 404,],).toContain(result.status,);
  });
});
