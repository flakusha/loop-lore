/**
 * Crafting Recipe Routes tests.
 *
 * Mounts the recipe routes behind a stub auth middleware and exercises
 * CRUD over a real test DB: create-with-materials, get, list, update,
 * replace materials, and delete. Verifies world-ownership gating.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertItems, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { craftingRecipeRoutes, } from "./crafting";

const mockDb = {} as any;

describe("craftingRecipeRoutes", () => {
  test("exports function", () => {
    expect(typeof craftingRecipeRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = craftingRecipeRoutes({ database: mockDb, },);
    expect(plugin,).toBeDefined();
  });
});

describe("crafting recipe CRUD (auth-gated)", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let outputItemId: string;
  let materialItemId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Crafter",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "Craft World", { id: worldId, } as never,);
    outputItemId = uid();
    materialItemId = uid();
    await insertItems(db, worldId, "Iron Sword", "weapon", { id: outputItemId, } as never,);
    await insertItems(db, worldId, "Iron Bar", "material", { id: materialItemId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * Mount crafting routes behind a stub auth middleware that sets ctx.userId.
   * @param actingUserId
   */
  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-crafting-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(craftingRecipeRoutes({ database: db, },),) as any;
  }

  /**
   * @param res
   */
  async function json(res: Response,) {
    return res.json() as unknown;
  }

  /**
   * Read an id off a response body, narrowing via `in`.
   * @param body
   */
  function readId(body: unknown,): string {
    if (typeof body === "object" && body !== null && "id" in body && typeof body.id === "string") {
      return body.id;
    }
    throw new Error("response missing string id",);
  }

  test("create recipe with materials returns id", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Smelt Iron Sword",
          discipline: "smithing",
          tier: 1,
          levelRequired: 5,
          outputItemId,
          outputQuantity: 1,
          materials: [{ itemId: materialItemId, quantity: 2, },],
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = await json(res,);
    expect(readId(body,),).toBeString();
  });

  test("get recipe returns materials", async () => {
    const app = authedApp();
    const createResponse = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Forge Axe",
          discipline: "smithing",
          tier: 2,
          levelRequired: 10,
          outputItemId,
          materials: [{ itemId: materialItemId, quantity: 3, },],
        },),
      },),
    );
    const id = readId(await json(createResponse,),);

    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes/${id}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await json(res,);
    if (typeof body !== "object" || body === null || !("name" in body) || !("materials" in body)) {
      throw new Error("recipe response missing fields",);
    }
    expect(body.name,).toBe("Forge Axe",);
    expect(Array.isArray(body.materials,),).toBe(true,);
    expect((body.materials as unknown[]).length,).toBe(1,);
  });

  test("list recipes filters by discipline", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes?discipline=smithing`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { recipes: unknown[] };
    expect(Array.isArray(body.recipes,),).toBe(true,);
    expect(body.recipes.length,).toBeGreaterThanOrEqual(2,);
  });

  test("update recipe and replace materials", async () => {
    const app = authedApp();
    const createResponse = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Enchant Blade",
          discipline: "enchanting",
          tier: 1,
          levelRequired: 3,
          outputItemId,
          materials: [{ itemId: materialItemId, quantity: 1, },],
        },),
      },),
    );
    const id = readId(await json(createResponse,),);

    const upRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ tier: 3, },),
      },),
    );
    expect(upRes.status,).toBe(200,);

    const matRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes/${id}/materials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ materials: [{ itemId: materialItemId, quantity: 4, },], },),
      },),
    );
    expect(matRes.status,).toBe(200,);

    const getResponse = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes/${id}`,),
    );
    const body = await json(getResponse,);
    if (typeof body !== "object" || body === null || !("tier" in body) || !("materials" in body)) {
      throw new Error("recipe response missing fields",);
    }
    expect(body.tier,).toBe(3,);
    const mats = body.materials as unknown[];
    if (mats[0] && typeof mats[0] === "object" && "quantity" in mats[0]) {
      expect(mats[0].quantity,).toBe(4,);
    } else {
      throw new Error("material missing quantity",);
    }
  });

  test("delete recipe removes it", async () => {
    const app = authedApp();
    const createResponse = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "Temp Recipe",
          discipline: "alchemy",
          tier: 1,
          levelRequired: 1,
          outputItemId,
        },),
      },),
    );
    const id = readId(await json(createResponse,),);

    const delRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes/${id}`, { method: "DELETE", },),
    );
    expect(delRes.status,).toBe(200,);

    const getResponse = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes/${id}`,),
    );
    expect(getResponse.status,).toBe(404,);
  });

  test("rejects non-owner with 403", async () => {
    const otherUserId = uid();
    const app = authedApp(otherUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/recipes`,),
    );
    expect(res.status,).toBe(403,);
  });
});
