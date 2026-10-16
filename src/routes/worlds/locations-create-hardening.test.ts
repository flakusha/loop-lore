/**
 * Location create/update hardening regression tests
 * (TASK-location-crud-tree-connections).
 *
 * Pins the write-path contract: client-supplied `path` is ignored (DB triggers
 * + repairPath are the sole writers), HTTP creates validate the parent
 * (existence, same world, LOCATION_DEPTH_LIMIT) exactly like
 * LocationTreeService.insertLocation, and update-path connections reject
 * self-links.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { seedChatSetupTemplates, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import { LOCATION_DEPTH_LIMIT, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertLocations, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { validateConnections, } from "./location-connections";
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
  return new Elysia({ name: "test-worlds-locations-harden", },)
    .derive(() => ({ userId, userRole, }))
    .use(locationRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("location write-path hardening", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let worldId: string;

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
        row_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    worldId = uid();
    await insertWorlds(db, ownerId, "Hardened World", { id: worldId, } as never,);
  },);

  afterAll(async () => {
    sqlite.close();
  },);

  /**
   * @param body
   */
  async function createLocation(
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = appWithAuth(db, ownerId, "solo",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );

    const parsed = (await res.json()) as unknown;
    return {
      status: res.status,
      body: parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {},
    };
  }

  test("create ignores a forged client path — the trigger materializes the canonical one", async () => {
    const created = await createLocation({ name: "Forged Root", path: "/forged/evil/", },);
    expect(created.status,).toBe(201,);
    const locId = created.body.id as string;

    const row = await db.selectFrom("locations",).selectAll().where("id", "=", locId,).executeTakeFirst();
    expect(row?.path,).toBe(`/${locId}/`,);
  });

  test("update ignores a forged client path — canonical path survives", async () => {
    const created = await createLocation({ name: "Forged Update", },);
    const locId = created.body.id as string;

    const app = appWithAuth(db, ownerId, "solo",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Renamed", path: "/forged/evil/", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const row = await db.selectFrom("locations",).selectAll().where("id", "=", locId,).executeTakeFirst();
    expect(row?.name,).toBe("Renamed",);
    expect(row?.path,).toBe(`/${locId}/`,);
  });

  test("update rejects a connections payload naming the location itself with 400", async () => {
    const created = await createLocation({ name: "Self Link", },);
    const locId = created.body.id as string;

    const app = appWithAuth(db, ownerId, "solo",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ connections: [locId,], },),
      },),
    );

    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error?: string };
    expect(body.error ?? "",).toContain("itself",);
  });

  test("create rejects a parent from another world with 400", async () => {
    const foreignWorldId = uid();
    await insertWorlds(db, ownerId, "Foreign World", { id: foreignWorldId, } as never,);
    const foreignLocId = await insertLocations(db, foreignWorldId, "Foreign Loc",);

    const created = await createLocation({ name: "Orphan", parentLocationId: foreignLocId, },);
    expect(created.status,).toBe(400,);
    expect(String(created.body.error ?? "",),).toContain("another world",);
  });

  test("create rejects a missing parent with 400", async () => {
    const created = await createLocation({ name: "Orphan", parentLocationId: uid(), },);
    expect(created.status,).toBe(400,);
    expect(String(created.body.error ?? "",),).toContain("not found",);
  });

  test(`HTTP creates respect LOCATION_DEPTH_LIMIT (${LOCATION_DEPTH_LIMIT}) — the 13th level is rejected`, async () => {
    // Build a LOCATION_DEPTH_LIMIT-deep chain entirely over HTTP.
    const root = await createLocation({ name: "L1", },);
    expect(root.status,).toBe(201,);
    let parentId = root.body.id as string;

    for (let depth = 2; depth <= LOCATION_DEPTH_LIMIT; depth += 1) {
      const next = await createLocation({ name: `L${depth}`, parentLocationId: parentId, },);
      expect(next.status,).toBe(201,);
      parentId = next.body.id as string;
    }

    // The chain is now LOCATION_DEPTH_LIMIT deep; one more level must fail.
    const overflow = await createLocation({ name: `L${LOCATION_DEPTH_LIMIT + 1}`, parentLocationId: parentId, },);
    expect(overflow.status,).toBe(400,);
    expect(String(overflow.body.error ?? "",),).toContain("depth exceeds limit",);
  });

  test("validateConnections maps an own-id payload to a self-link 400 even before the row exists", async () => {
    // The create path validates connections against the GENERATED id, which is
    // not yet in the locations table — the self-link check must win over the
    // missing-location check so the error mirrors the update path.
    const freshId = uid();
    const err = await validateConnections(db, worldId, [freshId,], freshId,);
    expect(err,).not.toBeNull();
    expect(err?.status,).toBe(400,);
    const body = (await err?.json()) as { error?: string };
    expect(body.error ?? "",).toContain("itself",);
  });
});
