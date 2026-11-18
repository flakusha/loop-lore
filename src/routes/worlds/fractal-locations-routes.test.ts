// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/worlds/fractal-locations-routes.test.ts — the read-side
// navigation endpoints: ancestors, descendants and breadcrumb path.
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { WorldVisibility, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, } from "../../test-utils/create-test-db";
import { insertLocations, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { fractalLocationsRoutes, } from "./fractal-locations-routes";
import type { HandleOpts, } from "./types";

const PREFIX = "/api/v1";

describe("fractalLocationsRoutes — navigation endpoints", () => {
  let db: Kysely<DB>;
  let fixture: Awaited<ReturnType<typeof createTestDb>>;
  let ownerId: string;
  let worldId: string;
  let rootId: string;
  let childId: string;
  let grandchildId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    fixture = await createTestDb();
    db = fixture.db;

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
    await insertWorlds(db, ownerId, "Locations World", {
      id: worldId,
      visibility: WorldVisibility.Private,
    } as never,);

    rootId = await insertLocations(db, worldId, "Root",);
    childId = await insertLocations(db, worldId, "Child", { parent_location_id: rootId, },);
    grandchildId = await insertLocations(db, worldId, "Grandchild", { parent_location_id: childId, },);
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  /** Mount the plugin on the v1 prefix with an injected auth context. */
  function appWithAuth(userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: "test-worlds-fractal-locations", },)
      .derive(() => ({ userId, userRole, }))
      .use(
        fractalLocationsRoutes({ database: db, config: {} as Config, } as HandleOpts, PREFIX,),
      ) as unknown as Elysia;
  }

  function navUrl(nav: "ancestors" | "descendants" | "path", locId: string, world = worldId,): string {
    return `http://localhost${PREFIX}/worlds/${world}/locations/${locId}/${nav}`;
  }

  async function navIds(nav: "ancestors" | "descendants" | "path", locId: string,): Promise<string[]> {
    const res = await appWithAuth(ownerId, "solo",).handle(new Request(navUrl(nav, locId,),),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { id: string }[] };
    return body.data.map((node,) => node.id);
  }

  test("ancestors are root-most first and exclude the location itself", async () => {
    expect(await navIds("ancestors", grandchildId,),).toEqual([rootId, childId,],);
  });

  test("descendants are breadth-first and exclude the location itself", async () => {
    expect(await navIds("descendants", rootId,),).toEqual([childId, grandchildId,],);
  });

  test("path is a root-to-leaf breadcrumb including the location itself", async () => {
    expect(await navIds("path", grandchildId,),).toEqual([rootId, childId, grandchildId,],);
  });

  test("an unknown location in an accessible world returns 404", async () => {
    const res = await appWithAuth(ownerId, "solo",).handle(new Request(navUrl("ancestors", uid(),),),);
    expect(res.status,).toBe(404,);
  });

  test("a location belonging to a different world returns 404", async () => {
    const otherWorld = uid();
    await insertWorlds(db, ownerId, "Other World", { id: otherWorld, visibility: WorldVisibility.Private, } as never,);
    const foreignLoc = await insertLocations(db, otherWorld, "Foreign",);

    const res = await appWithAuth(ownerId, "solo",).handle(
      new Request(navUrl("path", foreignLoc, worldId,),),
    );

    expect(res.status,).toBe(404,);
  });

  test("an anonymous caller cannot read a private world's location graph", async () => {
    const res = await appWithAuth(null, null,).handle(new Request(navUrl("descendants", rootId,),),);
    expect([401, 404,],).toContain(res.status,);
  });
});
