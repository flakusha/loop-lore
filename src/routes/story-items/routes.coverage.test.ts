// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route-level coverage for the story-item definition and instance plugins.
 *
 * `handlers.coverage.test.ts` drives the handler functions directly, so the
 * thin Elysia wrappers that pick `ctx.userId`/`ctx.userRole`/`ctx.params` and
 * call them were never executed. These tests go through HTTP so a broken
 * param name, a missing ownership guard, or a wrong status code fails here.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { seedChatSetupTemplates, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { worldsRoutes, } from "../worlds";
import { storyItemDefinitionsRoutes, } from "./definitions";
import { storyItemInstanceRoutes, } from "./instances";

/**
 * @param db
 * @param id
 * @param name
 */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, `user-${id}`, name, { id, } as never,);
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "user",
      display_name: name,
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

describe("story-items route coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  let worldId: string;

  /**
   * @param userId
   * @param userRole
   */
  function app(userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: "test-story-items-routes", },)
      .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
      .use(storyItemDefinitionsRoutes({ database: db, },),)
      .use(storyItemInstanceRoutes({ database: db, },),) as unknown as Elysia;
  }

  /**
   * @param method
   * @param path
   * @param userId
   * @param userRole
   * @param body
   */
  function req(
    method: string,
    path: string,
    userId: string,
    userRole: string,
    body?: unknown,
  ): Promise<Response> {
    return app(userId, userRole,).handle(
      new Request(`http://localhost${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify(body,),
        }),
      },),
    );
  }

  /**
   * @param name
   */
  async function createDefinition(name: string,): Promise<string> {
    const res = await req(
      "POST",
      `/api/worlds/${worldId}/items`,
      owner,
      "user",
      { name, category: "weapon", },
    );

    expect(res.status,).toBe(201,);
    const body: { id: string } = await res.json();
    return body.id;
  }

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedChatSetupTemplates(db,);
    await seedUser(db, owner, "Owner",);
    await seedUser(db, stranger, "Stranger",);
    const worldsApp = new Elysia({ name: "test-story-items-routes-world", },)
      .derive({ as: "scoped", }, () => ({ userId: owner, userRole: "user", }),)
      .use(worldsRoutes({ database: db, config: {} as never, },),) as unknown as Elysia;

    const res = await worldsApp.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Item World", },),
      },),
    );

    expect(res.status,).toBe(201,);
    const created: { id: string } = await res.json();
    worldId = created.id;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("POST /worlds/:worldId/items creates a definition the list endpoint returns", async () => {
    const itemId = await createDefinition("Rope",);

    const listed = await req("GET", `/api/worlds/${worldId}/items`, owner, "user",);
    expect(listed.status,).toBe(200,);
    const page: { data: { id: string }[] } = await listed.json();
    expect(page.data.some((row,) => row.id === itemId),).toBe(true,);
  });

  test("GET /worlds/:worldId/items?category= filters the definition list", async () => {
    const itemId = await createDefinition("Lantern",);

    const weapons = await req("GET", `/api/worlds/${worldId}/items?category=weapon`, owner, "user",);
    const body: { data: { id: string }[] } = await weapons.json();
    expect(body.data.some((row,) => row.id === itemId),).toBe(true,);

    const armor = await req("GET", `/api/worlds/${worldId}/items?category=armor`, owner, "user",);
    const armorBody: { data: { id: string }[] } = await armor.json();
    expect(armorBody.data.some((row,) => row.id === itemId),).toBe(false,);
  });

  test("GET/PUT/DELETE /worlds/:worldId/items/:itemId round-trips one definition", async () => {
    const itemId = await createDefinition("Chisel",);

    const fetched = await req("GET", `/api/worlds/${worldId}/items/${itemId}`, owner, "user",);
    expect(fetched.status,).toBe(200,);
    const before: { name: string } = await fetched.json();
    expect(before.name,).toBe("Chisel",);

    const updated = await req(
      "PUT",
      `/api/worlds/${worldId}/items/${itemId}`,
      owner,
      "user",
      { name: "Mallet", },
    );

    expect(updated.status,).toBe(200,);
    const after: { name: string } = await updated.json();
    expect(after.name,).toBe("Mallet",);

    const deleted = await req("DELETE", `/api/worlds/${worldId}/items/${itemId}`, owner, "user",);
    expect(deleted.status,).toBe(204,);

    const gone = await req("GET", `/api/worlds/${worldId}/items/${itemId}`, owner, "user",);
    expect(gone.status,).toBe(404,);
  });

  test("item definition routes 404 a stranger who does not own the world", async () => {
    const itemId = await createDefinition("Relic",);

    expect((await req("GET", `/api/worlds/${worldId}/items`, stranger, "user",)).status,).toBe(404,);
    expect((await req("GET", `/api/worlds/${worldId}/items/${itemId}`, stranger, "user",)).status,).toBe(404,);
    expect(
      (await req("PUT", `/api/worlds/${worldId}/items/${itemId}`, stranger, "user", { name: "X", },)).status,
    ).toBe(404,);

    expect(
      (await req("DELETE", `/api/worlds/${worldId}/items/${itemId}`, stranger, "user",)).status,
    ).toBe(404,);

    const stillThere = await req("GET", `/api/worlds/${worldId}/items/${itemId}`, owner, "user",);
    expect(stillThere.status,).toBe(200,);
  });

  test("POST/GET item-instances place an instance and both list routes return it", async () => {
    const itemId = await createDefinition("Torch",);
    const locationId = uid();
    await db
      .insertInto("locations",)
      .values({ id: locationId, world_id: worldId, name: "Cave", connections: "[]", },)
      .execute();

    const placed = await req(
      "POST",
      `/api/worlds/${worldId}/item-instances`,
      owner,
      "user",
      { itemId, locationId, quantity: 3, },
    );

    expect(placed.status,).toBe(201,);
    const { id: instanceId, } = await placed.json();

    const all = await req("GET", `/api/worlds/${worldId}/item-instances`, owner, "user",);
    expect(all.status,).toBe(200,);
    const rows: { id: string; quantity: number }[] = await all.json();
    expect(rows.some((row,) => row.id === instanceId && row.quantity === 3),).toBe(true,);

    const byItem = await req("GET", `/api/worlds/${worldId}/items/${itemId}/instances`, owner, "user",);
    expect(byItem.status,).toBe(200,);
    const byItemRows: { id: string }[] = await byItem.json();
    expect(byItemRows.some((row,) => row.id === instanceId),).toBe(true,);

    const filtered = await req(
      "GET",
      `/api/worlds/${worldId}/item-instances?locationId=${locationId}`,
      owner,
      "user",
    );

    const filteredRows: { id: string }[] = await filtered.json();
    expect(filteredRows.some((row,) => row.id === instanceId),).toBe(true,);

    const elsewhere = await req(
      "GET",
      `/api/worlds/${worldId}/item-instances?locationId=${uid()}`,
      owner,
      "user",
    );

    const elsewhereRows: { id: string }[] = await elsewhere.json();
    expect(elsewhereRows.some((row,) => row.id === instanceId),).toBe(false,);
  });

  test("transfer moves an instance and DELETE removes it", async () => {
    const itemId = await createDefinition("Coin",);

    const placed = await req(
      "POST",
      `/api/worlds/${worldId}/item-instances`,
      owner,
      "user",
      { itemId, },
    );

    expect(placed.status,).toBe(201,);
    const { id: instanceId, } = await placed.json();

    const moved = await req(
      "POST",
      `/api/worlds/${worldId}/item-instances/${instanceId}/transfer`,
      owner,
      "user",
      { quantity: 1, toActorId: owner, },
    );

    expect(moved.status,).toBe(200,);

    const destroyed = await req("DELETE", `/api/worlds/${worldId}/item-instances/${instanceId}`, owner, "user",);
    expect(destroyed.status,).toBe(204,);

    const remaining = await req("GET", `/api/worlds/${worldId}/items/${itemId}/instances`, owner, "user",);
    const remainingRows: { id: string }[] = await remaining.json();
    expect(remainingRows.some((row,) => row.id === instanceId),).toBe(false,);
  });

  test("instance routes 404 a stranger who does not own the world", async () => {
    const itemId = await createDefinition("Key",);

    const placed = await req(
      "POST",
      `/api/worlds/${worldId}/item-instances`,
      owner,
      "user",
      { itemId, },
    );

    expect(placed.status,).toBe(201,);
    const { id: instanceId, } = await placed.json();

    const deniedPlace = await req(
      "POST",
      `/api/worlds/${worldId}/item-instances`,
      stranger,
      "user",
      { itemId, },
    );

    expect(deniedPlace.status,).toBe(404,);

    expect((await req("GET", `/api/worlds/${worldId}/item-instances`, stranger, "user",)).status,).toBe(404,);
    expect(
      (await req("GET", `/api/worlds/${worldId}/items/${itemId}/instances`, stranger, "user",)).status,
    ).toBe(404,);

    const deniedTransfer = await req(
      "POST",
      `/api/worlds/${worldId}/item-instances/${instanceId}/transfer`,
      stranger,
      "user",
      { quantity: 1, },
    );

    expect(deniedTransfer.status,).toBe(404,);
    expect(
      (await req("DELETE", `/api/worlds/${worldId}/item-instances/${instanceId}`, stranger, "user",)).status,
    ).toBe(404,);
  });
});
