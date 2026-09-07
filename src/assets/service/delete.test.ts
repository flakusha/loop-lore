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
import type { DB, } from "../../db/schema";
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
});
