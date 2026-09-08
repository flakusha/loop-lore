import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetType, AssetVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { createAssetProviders, } from "./assets";

let db: Kysely<DB>;
let sqlite: Database;
let ownerId: string;
let strangerId: string;
let publicId: string;
let privateId: string;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  ownerId = uid();
  strangerId = uid();
  publicId = uid();
  privateId = uid();
  await insertUsers(db, "asset-owner", "Owner", { id: ownerId, } as never,);
  await insertUsers(db, "asset-stranger", "Stranger", { id: strangerId, } as never,);
  await insertAssets(db, ownerId, "Tavern interior.png", "image/png", AssetType.Image, 1024, "/tavern.png", {
    id: publicId,
    visibility: AssetVisibility.Public,
    alt_text: "cozy tavern hall",
  },);
  await insertAssets(db, ownerId, "Old tavern cellar.png", "image/png", AssetType.Image, 2048, "/cellar.png", {
    id: privateId,
    visibility: AssetVisibility.Private,
    alt_text: "dark cellar",
  },);
  await insertAssets(db, strangerId, "Dragon portrait.png", "image/png", AssetType.Image, 512, "/dragon.png", {
    visibility: AssetVisibility.Public,
    alt_text: "red dragon",
  },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

describe("search/providers/assets (fuzzy)", () => {
  test("ranks visible matches prefix-first", async () => {
    const { fuzzy, } = createAssetProviders(db,);
    const hits = await fuzzy(
      { q: "tavern", mode: "fuzzy", },
      { kind: "assets", userId: ownerId, },
    );
    expect(hits.map((h,) => h.id),).toEqual([publicId, privateId,],);
    expect(hits[0]?.source,).toBe("fuzzy",);
  });
  test("strangers see only public assets", async () => {
    const { fuzzy, } = createAssetProviders(db,);
    const hits = await fuzzy(
      { q: "tavern", mode: "fuzzy", },
      { kind: "assets", userId: strangerId, },
    );
    expect(hits.map((h,) => h.id),).toEqual([publicId,],);
  });
  test("type filter narrows and unknown types are ignored", async () => {
    const { fuzzy, } = createAssetProviders(db,);
    const scope = { kind: "assets", userId: ownerId, } as const;
    const audio = await fuzzy(
      { q: "tavern", mode: "fuzzy", filters: { assetType: "audio", }, },
      { ...scope, },
    );
    expect(audio,).toEqual([],);
    const bogus = await fuzzy(
      { q: "tavern", mode: "fuzzy", filters: { assetType: "bogus", }, },
      { ...scope, },
    );
    expect(bogus.map((h,) => h.id),).toEqual([publicId, privateId,],);
  });
});

describe("search/providers/assets (exact)", () => {
  test("id lookup honors visibility", async () => {
    const { exact, } = createAssetProviders(db,);
    const own = await exact({ q: privateId, mode: "exact", }, { kind: "assets", userId: ownerId, },);
    expect(own,).toHaveLength(1,);
    expect(own[0]?.score,).toBe(1,);
    const denied = await exact(
      { q: privateId, mode: "exact", },
      { kind: "assets", userId: strangerId, },
    );
    expect(denied,).toEqual([],);
  });
});
