// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
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

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-worlds-locations-crud", },)
    .derive(() => ({ userId, userRole, }))
    .use(locationRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("locationRoutes — create/get/update", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
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

  test("POST without a name is rejected with 400", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Nameless World", { id: worldId, } as never,);

    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ description: "no name", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST creates a location with its chat and GET round-trips it", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Tavern World", { id: worldId, } as never,);

    const created = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Tavern", description: "Cozy", },),
      },),
    );
    expect(created.status,).toBe(201,);
    const { id: locId, } = (await created.json()) as { id: string };

    const fetched = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}`,),
    );
    expect(fetched.status,).toBe(200,);
    const body = (await fetched.json()) as { name: string; description: string };
    expect(body.name,).toBe("Tavern",);
    expect(body.description,).toBe("Cozy",);
  });

  test("GET on a missing location returns 404", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Empty World", { id: worldId, } as never,);

    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${uid()}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET does not leak locations from another world", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldA = uid();
    const worldB = uid();
    await insertWorlds(db, ownerId, "World A", { id: worldA, } as never,);
    await insertWorlds(db, ownerId, "World B", { id: worldB, } as never,);
    const locId = uid();
    await insertLocations(db, worldA, "Hidden Cove", { id: locId, } as never,);

    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldB}/locations/${locId}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("PUT renames the location and persists", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Rename World", { id: worldId, } as never,);
    const locId = uid();
    await insertLocations(db, worldId, "Old Name", { id: locId, } as never,);

    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "New Name", description: "Updated", },),
      },),
    );
    expect(res.status,).toBe(200,);

    const row = await db
      .selectFrom("locations",)
      .select(["name", "description",],)
      .where("id", "=", locId,)
      .executeTakeFirst();
    expect(row?.name,).toBe("New Name",);
    expect(row?.description,).toBe("Updated",);
  });

  test("PUT with non-string connections is rejected with 400", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Conn World", { id: worldId, } as never,);
    const locId = uid();
    await insertLocations(db, worldId, "Crossroads", { id: locId, } as never,);

    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ connections: [123,], },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("PUT with a valid connection persists the JSON link", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const worldId = uid();
    await insertWorlds(db, ownerId, "Link World", { id: worldId, } as never,);
    const locId = uid();
    const otherId = uid();
    await insertLocations(db, worldId, "Bridge", { id: locId, } as never,);
    await insertLocations(db, worldId, "Forest", { id: otherId, } as never,);

    const res = await app.handle(
      new Request(`${BASE}/api/worlds/${worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ connections: [otherId,], },),
      },),
    );
    expect(res.status,).toBe(200,);

    const row = await db
      .selectFrom("locations",)
      .select("connections",)
      .where("id", "=", locId,)
      .executeTakeFirst();
    expect(row?.connections,).toBe(JSON.stringify([otherId,],),);
  });
});
