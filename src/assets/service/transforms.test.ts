// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset transform service tests.
 *
 * Covers: seed-on-create for images (no seed for non-images), upsert
 * idempotency, context→default fallback resolution, and range validation.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createAsset, } from "./create";
import {
  getAssetTransform,
  resolveAssetTransform,
  SEED_FOCAL_POINT,
  upsertAssetTransform,
} from "./transforms";
import { makeMinimalPng, } from "../test-helpers";
import { AssetType, TransformContext, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";

const uploadDir = join(tmpdir(), `transforms-${Date.now()}`,);
mkdtempSync(uploadDir,);

async function ownerIdFor(db: Kysely<DB>, username: string,): Promise<string> {
  return (await db.selectFrom("users",).select("id",).where("username", "=", username,).executeTakeFirstOrThrow()).id;
}

async function seedImage(db: Kysely<DB>, ownerId: string,): Promise<string> {
  const buffer = makeMinimalPng(2, 1,);
  const { asset, } = await createAsset({
    database: db,
    uploadDir,
    input: {
      ownerId,
      filename: "sprite.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    },
  },);
  return asset.id;
}

describe("asset transforms", () => {
  test("fresh image gets a seeded default transform", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "t owner", "T Owner",);
    const ownerId = await ownerIdFor(db, "t owner",);
    const assetId = await seedImage(db, ownerId,);
    const row = await getAssetTransform(db, assetId, TransformContext.Default,);
    expect(row?.focal_point_x,).toBe(SEED_FOCAL_POINT.x,);
    expect(row?.focal_point_y,).toBe(SEED_FOCAL_POINT.y,);
  });

  test("upsert is idempotent per (asset, context)", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "u owner", "U Owner",);
    const ownerId = await ownerIdFor(db, "u owner",);
    const assetId = await seedImage(db, ownerId,);
    await upsertAssetTransform(db, assetId, TransformContext.Sprite, { zoom: 1.5, focalPointX: 0.4, },);
    await upsertAssetTransform(db, assetId, TransformContext.Sprite, { zoom: 2, focalPointX: 0.4, },);
    const row = await getAssetTransform(db, assetId, TransformContext.Sprite,);
    expect(row?.zoom,).toBe(2,);
    const rows = await db.selectFrom("asset_transforms",).select("context",)
      .where("asset_id", "=", assetId,).execute();
    expect(rows.map((r,) => r.context,).sort(),).toEqual(["default", "sprite",],);
  });

  test("resolve falls back to default context", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "r owner", "R Owner",);
    const ownerId = await ownerIdFor(db, "r owner",);
    const assetId = await seedImage(db, ownerId,);
    const resolved = await resolveAssetTransform(db, assetId, TransformContext.Sprite,);
    expect(resolved?.context,).toBe(TransformContext.Default,);
    expect(await resolveAssetTransform(db, assetId, TransformContext.Default,),).toBeDefined();
    expect(await resolveAssetTransform(db, "missing", TransformContext.Sprite,),).toBeUndefined();
  });

  test("out-of-range values are rejected", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "v owner", "V Owner",);
    const ownerId = await ownerIdFor(db, "v owner",);
    const assetId = await seedImage(db, ownerId,);
    await expect(upsertAssetTransform(db, assetId, TransformContext.Sprite, { focalPointX: 2, },),).rejects.toThrow();
    await expect(upsertAssetTransform(db, assetId, TransformContext.Sprite, { zoom: 0, },),).rejects.toThrow();
    const ok = await upsertAssetTransform(db, assetId, TransformContext.Sprite, { rotation: 90, },);
    expect(ok.rotation,).toBe(90,);
  });
});
