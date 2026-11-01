// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * nsfw-flag unit tests — the v1 NSFW rating signal for assets.
 *
 * An asset is NSFW iff it is linked (asset_links.entity_type = 'actor') to an
 * actor whose content_rating is NSFW. Covers the positive, SFW, non-actor
 * link, and empty-input paths over the real migration-built schema.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetLinkEntity, AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertAssetLinks, insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { nsfwFlaggedAssetIds, } from "./nsfw-flag";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];
const OWNER = "user-owner";

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "owner", "Owner", { id: OWNER, } as never,);
},);

afterAll(async () => {
  db.destroy();
},);

/** Create one asset and link it to a fresh actor with the given rating. */
async function assetLinkedTo(
  contentRating: string,
  entityType: AssetLinkEntity = AssetLinkEntity.Actor,
): Promise<string> {
  const assetId = await insertAssets(
    db,
    OWNER,
    `${contentRating}-${crypto.randomUUID()}.png`,
    "image/png",
    AssetType.Image,
    10,
    "raw/x.png",
  );

  const actorId = await insertActors(
    db,
    `Actor ${contentRating}`,
    { content_rating: contentRating, user_id: OWNER, } as never,
  );

  await insertAssetLinks(db, assetId, entityType, actorId,);
  return assetId;
}

describe("nsfwFlaggedAssetIds", () => {
  test("flags assets linked to NSFW-rated actors", async () => {
    const flagged = await assetLinkedTo("nsfw_moderate",);
    const sfw = await assetLinkedTo("sfw",);

    const result = await nsfwFlaggedAssetIds(db, [flagged, sfw,],);

    expect(result.has(flagged,),).toBe(true,);
    expect(result.has(sfw,),).toBe(false,);
    expect(result.size,).toBe(1,);
  });

  test("treats every NSFW severity tier as flagged", async () => {
    const ids = [
      await assetLinkedTo("nsfw_mild",),
      await assetLinkedTo("nsfw_intense",),
      await assetLinkedTo("nsfw_extreme",),
    ];

    const result = await nsfwFlaggedAssetIds(db, ids,);

    expect([...result,].sort(),).toEqual([...ids,].sort(),);
  });

  test("ignores non-actor links to an NSFW id space", async () => {
    const assetId = await insertAssets(db, OWNER, "world-linked.png", "image/png", AssetType.Image, 10, "raw/x.png",);
    await insertAssetLinks(db, assetId, AssetLinkEntity.World, "actor-not-a-world",);

    const result = await nsfwFlaggedAssetIds(db, [assetId,],);

    expect(result.size,).toBe(0,);
  });

  test("answers an empty set without querying when ids are empty", async () => {
    const result = await nsfwFlaggedAssetIds(db, [],);

    expect(result.size,).toBe(0,);
  });

  test("unknown ids are simply absent (no membership oracle)", async () => {
    const result = await nsfwFlaggedAssetIds(db, [crypto.randomUUID(),],);

    expect(result.size,).toBe(0,);
  });
});
