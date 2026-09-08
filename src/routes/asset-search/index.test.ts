import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AssetType, AssetVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { assetSearchRoutes, } from "./index";

const BASE = "http://localhost";

let db: Kysely<DB>;
let sqlite: Database;
let ownerId: string;
let strangerId: string;

function searchApp(userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-asset-search", },)
    .derive(() => ({ userId, userRole, }))
    .use(assetSearchRoutes({ database: db, },),) as unknown as Elysia;
}

function get(app: Elysia, path: string,): Promise<Response> {
  const handle = (app as unknown as { handle: (r: Request,) => Promise<Response> }).handle;
  return handle(new Request(`${BASE}${path}`,),);
}

interface SearchBody {
  results: { assetId: string; filename: string; matchScore: number }[];
  total: number;
  hasMore: boolean;
  query: string;
}

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  ownerId = uid();
  strangerId = uid();
  await insertUsers(db, "gallery-owner", "Owner", { id: ownerId, } as never,);
  await insertUsers(db, "gallery-stranger", "Stranger", { id: strangerId, } as never,);
  await insertAssets(db, ownerId, "Tavern interior.png", "image/png", AssetType.Image, 1024, "/t.png", {
    visibility: AssetVisibility.Public,
    alt_text: "cozy tavern hall",
  },);
  await insertAssets(db, ownerId, "Old tavern cellar.png", "image/png", AssetType.Image, 2048, "/c.png", {
    visibility: AssetVisibility.Private,
    alt_text: "dark cellar",
  },);
  await insertAssets(db, ownerId, "Tavern brawl.png", "image/png", AssetType.Image, 512, "/b.png", {
    visibility: AssetVisibility.Public,
    alt_text: "bar fight",
  },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

describe("assetSearchRoutes", () => {
  test("ranks visible matches with total and query echo", async () => {
    const res = await get(searchApp(ownerId, "user",), "/api/assets/search?q=tavern",);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.query,).toBe("tavern",);
    expect(body.total,).toBe(3,);
    expect(body.results,).toHaveLength(3,);
    expect(body.results.map((r,) => r.filename).sort(),).toEqual([
      "Old tavern cellar.png",
      "Tavern brawl.png",
      "Tavern interior.png",
    ],);
    expect(body.hasMore,).toBe(false,);
  });
  test("strangers see only public assets", async () => {
    const res = await get(searchApp(strangerId, "user",), "/api/assets/search?q=tavern",);
    const body = (await res.json()) as SearchBody;
    expect(body.total,).toBe(2,);
  });
  test("limit/offset paginate with honest hasMore", async () => {
    const first = (await (
      await get(searchApp(ownerId, "user",), "/api/assets/search?q=tavern&limit=2&offset=0",)
    ).json()) as SearchBody;
    expect(first.results,).toHaveLength(2,);
    expect(first.hasMore,).toBe(true,);
    const second = (await (
      await get(searchApp(ownerId, "user",), "/api/assets/search?q=tavern&limit=2&offset=2",)
    ).json()) as SearchBody;
    expect(second.results,).toHaveLength(1,);
    expect(second.hasMore,).toBe(false,);
  });
  test("unauthenticated callers get 401", async () => {
    const res = await get(searchApp(null, null,), "/api/assets/search?q=tavern",);
    expect(res.status,).toBe(401,);
  });
});
