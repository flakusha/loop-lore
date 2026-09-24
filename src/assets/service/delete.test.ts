// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/delete.ts — record + file + link cascade.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { AssetAlphaStatus, AssetLinkEntity, TransformContext, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { MATTING_SOURCE_LABEL, } from "../../generation/matting/service";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssetLinks, insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { deleteAsset, } from "./delete";

const ASSET_ID = "c1a2b3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const STORAGE_PATH = "raw/c1/a2/c1a2b3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d.png";
const OWNER = "delete-owner";

async function seedWithFile(db: Kysely<DB>, uploadDir: string,): Promise<void> {
  await insertUsers(db, OWNER, "Delete Owner",);
  const owner = await db.selectFrom("users",).select("id",).where("username", "=", OWNER,).executeTakeFirstOrThrow();
  await insertAssets(
    db,
    owner.id,
    "doomed.png",
    "image/png",
    "image" as never,
    8,
    STORAGE_PATH,
    { id: ASSET_ID as never, },
  );
  await insertAssetLinks(db, ASSET_ID, "character", "char-1",);
  const fileDir = join(uploadDir, "raw", "c1", "a2",);
  mkdirSync(fileDir, { recursive: true, },);
  writeFileSync(join(uploadDir, STORAGE_PATH,), "PNGDATA",);
}

describe("deleteAsset", () => {
  test("returns false for a missing asset and touches nothing", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-del-",),);
    try {
      expect(await deleteAsset({ database: db, assetId: "ghost", uploadDir, },),).toBe(false,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("deletes the file, the links, and the record; returns true", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-del-",),);
    try {
      await seedWithFile(db, uploadDir,);
      expect(existsSync(join(uploadDir, STORAGE_PATH,),),).toBe(true,);

      const result = await deleteAsset({ database: db, assetId: ASSET_ID, uploadDir, },);
      expect(result,).toBe(true,);

      expect(existsSync(join(uploadDir, STORAGE_PATH,),),).toBe(false,);
      const links = await db.selectFrom("asset_links",).selectAll().where("asset_id", "=", ASSET_ID,).execute();
      expect(links,).toEqual([],);
      const record = await db.selectFrom("assets",).selectAll().where("id", "=", ASSET_ID,).executeTakeFirst();
      expect(record,).toBeUndefined();
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("succeeds even when the backing file is already gone", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-del-",),);
    try {
      await insertUsers(db, OWNER, "Delete Owner",);
      const owner = await db.selectFrom("users",).select("id",).where("username", "=", OWNER,)
        .executeTakeFirstOrThrow();
      await insertAssets(
        db,
        owner.id,
        "ghosted.png",
        "image/png",
        "image" as never,
        8,
        "raw/ff/ee/missing.png",
        { id: ASSET_ID as never, },
      );
      expect(existsSync(join(uploadDir, "raw",),),).toBe(false,);

      expect(await deleteAsset({ database: db, assetId: ASSET_ID, uploadDir, },),).toBe(true,);
      const record = await db.selectFrom("assets",).selectAll().where("id", "=", ASSET_ID,).executeTakeFirst();
      expect(record,).toBeUndefined();
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("reverts a matted derivative's source asset back to raw", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-del-",),);
    try {
      await insertUsers(db, OWNER, "Delete Owner",);
      const owner = await db.selectFrom("users",).select("id",).where("username", "=", OWNER,)
        .executeTakeFirstOrThrow();
      const sourceId = "00000000-0000-4000-8000-0000000000a1";
      const derivativeId = "00000000-0000-4000-8000-0000000000a2";
      await insertAssets(db, owner.id, "source.png", "image/png", "image" as never, 8, "raw/00/source.png", {
        id: sourceId as never,
        alpha_status: AssetAlphaStatus.Raw,
      },);
      await insertAssets(db, owner.id, "matted.png", "image/png", "image" as never, 8, "raw/00/matted.png", {
        id: derivativeId as never,
        alpha_status: AssetAlphaStatus.Matted,
      },);
      await insertAssetLinks(db, derivativeId, AssetLinkEntity.Asset, sourceId, {
        label: MATTING_SOURCE_LABEL,
      },);

      expect(await deleteAsset({ database: db, assetId: derivativeId, uploadDir, },),).toBe(true,);

      const source = await db.selectFrom("assets",).selectAll().where("id", "=", sourceId,).executeTakeFirst();
      expect(source,).toBeDefined();
      expect(source?.alpha_status,).toBe(AssetAlphaStatus.Raw,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("recursively deletes derivatives linking to the deleted asset", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-del-",),);
    try {
      await insertUsers(db, OWNER, "Delete Owner",);
      const owner = await db.selectFrom("users",).select("id",).where("username", "=", OWNER,)
        .executeTakeFirstOrThrow();
      const parentId = "00000000-0000-4000-8000-0000000000b1";
      const childId = "00000000-0000-4000-8000-0000000000b2";
      await insertAssets(db, owner.id, "parent.png", "image/png", "image" as never, 8, "raw/00/parent.png", {
        id: parentId as never,
      },);
      await insertAssets(db, owner.id, "child.png", "image/png", "image" as never, 8, "raw/00/child.png", {
        id: childId as never,
      },);
      await insertAssetLinks(db, childId, AssetLinkEntity.Asset, parentId,);

      expect(await deleteAsset({ database: db, assetId: parentId, uploadDir, },),).toBe(true,);

      const child = await db.selectFrom("assets",).selectAll().where("id", "=", childId,).executeTakeFirst();
      expect(child,).toBeUndefined();
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("removes every FK-dependent row: links, transforms, shares, avatar back-refs", async () => {
    // Regression for DELETE /api/assets/:id 500 (FOREIGN KEY constraint
    // failed): a fresh image always carries an asset_transforms row (created
    // by createAsset -> seedBaseTransform), and asset_shares plus the
    // nullable actors/characters/personas.avatar_asset_id back-refs have NO
    // ACTION FKs — the assets delete only succeeds when all of them are
    // cleaned inside the same transaction.
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-del-",),);
    try {
      await insertUsers(db, OWNER, "Delete Owner",);
      const owner = await db.selectFrom("users",).select("id",).where("username", "=", OWNER,)
        .executeTakeFirstOrThrow();
      await insertAssets(
        db,
        owner.id,
        "connected.png",
        "image/png",
        "image" as never,
        8,
        "raw/aa/bb/connected.png",
        { id: ASSET_ID as never, },
      );
      await insertAssetLinks(db, ASSET_ID, "character", "char-9",);

      await db.insertInto("asset_transforms",).values({
        asset_id: ASSET_ID,
        context: TransformContext.Default,
        focal_point_x: 0.5,
        focal_point_y: 0.5,
      },).execute();

      const shareTarget = "00000000-0000-4000-8000-0000000000c1";
      const sharer = "00000000-0000-4000-8000-0000000000c2";
      await db.insertInto("actors",).values({ id: shareTarget, display_name: "Share Target", },).execute();
      await db.insertInto("actors",).values({ id: sharer, display_name: "Sharer", },).execute();
      await db.insertInto("asset_shares",).values({
        id: "00000000-0000-4000-8000-0000000000c3",
        asset_id: ASSET_ID,
        shared_with_id: shareTarget,
        shared_by_id: sharer,
      },).execute();
      await db.insertInto("personas",).values({
        user_id: owner.id,
        name: "Avatar Persona",
        avatar_asset_id: ASSET_ID,
      },).execute();

      expect(await deleteAsset({ database: db, assetId: ASSET_ID, uploadDir, },),).toBe(true,);

      const links = await db.selectFrom("asset_links",).selectAll().where("asset_id", "=", ASSET_ID,).execute();
      expect(links,).toEqual([],);
      const transforms = await db.selectFrom("asset_transforms",).selectAll().where("asset_id", "=", ASSET_ID,)
        .execute();
      expect(transforms,).toEqual([],);
      const shares = await db.selectFrom("asset_shares",).selectAll().where("asset_id", "=", ASSET_ID,).execute();
      expect(shares,).toEqual([],);
      const persona = await db.selectFrom("personas",).selectAll().executeTakeFirstOrThrow();
      expect(persona.avatar_asset_id,).toBeNull();
      const record = await db.selectFrom("assets",).selectAll().where("id", "=", ASSET_ID,).executeTakeFirst();
      expect(record,).toBeUndefined();
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});
