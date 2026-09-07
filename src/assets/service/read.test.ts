// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/read.ts — get, list, visibility filter,
 * access check, and decrypted read.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { canAccessAsset, getAsset, getAssetData, isAssetEncrypted, listAssets, } from "./read";

const ASSET_ID = "d1a2b3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ASSET_PATH = `raw/${ASSET_ID.slice(0, 2,)}/${ASSET_ID.slice(2, 4,)}/${ASSET_ID}.png`;
const OWNER = "read-owner";
const OTHER = "read-other";

async function makeUser(db: Kysely<DB>, username: string, display: string,): Promise<string> {
  await insertUsers(db, username, display,);
  return db.selectFrom("users",).select("id",).where("username", "=", username,).executeTakeFirstOrThrow().then((r,) =>
    r.id
  );
}

async function seedOwner(
  db: Kysely<DB>,
  uploadDir: string,
  writeFile = true,
): Promise<string> {
  const ownerId = await makeUser(db, OWNER, "Read Owner",);
  await insertAssets(db, ownerId, "readme.png", "image/png", "image" as never, 8, ASSET_PATH, {
    id: ASSET_ID as never,
  },);
  if (writeFile) {
    mkdirSync(join(uploadDir, "raw", ASSET_ID.slice(0, 2,), ASSET_ID.slice(2, 4,),), { recursive: true, },);
    writeFileSync(join(uploadDir, ASSET_PATH,), "PNGCONTENT",);
  }
  return ownerId;
}

describe("getAsset", () => {
  test("returns the asset record when it exists", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      await seedOwner(db, uploadDir,);
      const asset = await getAsset(db, ASSET_ID,);
      expect(asset,).not.toBeNull();
      expect(asset!.filename,).toBe("readme.png",);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("returns null for a missing asset", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      expect(await getAsset(db, "ghost",),).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});

describe("getAssetData", () => {
  test("returns null when the asset does not exist", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      expect(await getAssetData(db, "ghost", uploadDir,),).toBeNull();
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("returns null when the file is missing from disk", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      // seedOwner WITHOUT writing the file — asset row exists, no file on disk
      await seedOwner(db, uploadDir, false,);
      expect(await getAssetData(db, ASSET_ID, uploadDir,),).toBeNull();
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("returns raw file data for a public asset", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      await seedOwner(db, uploadDir,);
      const data = await getAssetData(db, ASSET_ID, uploadDir,);
      expect(data,).toBeInstanceOf(Buffer,);
      expect(data!.toString(),).toBe("PNGCONTENT",);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("throws when an encrypted asset is accessed without a chatKey", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      const encPath = `raw/e1/e2/secret.png`;
      mkdirSync(join(uploadDir, "raw", "e1", "e2",), { recursive: true, },);
      writeFileSync(join(uploadDir, encPath,), "CIPHERTEXT",);
      await insertAssets(db, ownerId, "secret.png", "image/png", "image" as never, 8, encPath, {
        id: "encrypted-asset" as never,
        encryption_tier: "standard" as never,
        encrypted_key_id: "key-1" as never,
      },);
      await expect(getAssetData(db, "encrypted-asset", uploadDir,),).rejects.toThrow(
        "Chat key required to decrypt encrypted asset",
      );
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});

describe("isAssetEncrypted", () => {
  test("returns false for a missing asset", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      expect(await isAssetEncrypted(db, "ghost",),).toBe(false,);
    } finally {
      sqlite.close();
    }
  });

  test("returns false for a public-tier asset", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      await seedOwner(db, uploadDir,);
      expect(await isAssetEncrypted(db, ASSET_ID,),).toBe(false,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("returns true for an encrypted-tier asset with a key id", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      await insertAssets(db, ownerId, "secret.png", "image/png", "image" as never, 8, "raw/e1/e2/secret.png", {
        id: "enc-asset" as never,
        encryption_tier: "standard" as never,
        encrypted_key_id: "key-x" as never,
      },);
      expect(await isAssetEncrypted(db, "enc-asset",),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});

describe("canAccessAsset", () => {
  test("admin always has access", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      await seedOwner(db, uploadDir,);
      expect(await canAccessAsset(db, ASSET_ID, "anyone", "admin",),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("returns false for a missing asset (non-admin)", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      // Non-admin + no ownership → asset not found → false
      expect(await canAccessAsset(db, "ghost", "someone", null,),).toBe(false,);
    } finally {
      sqlite.close();
    }
  });

  test("owner always has access", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      expect(await canAccessAsset(db, ASSET_ID, ownerId, null,),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("anonymous cannot access a private asset", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      await seedOwner(db, uploadDir,);
      expect(await canAccessAsset(db, ASSET_ID, null, null,),).toBe(false,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("a non-null actor can access a public asset", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      const strangerId = await makeUser(db, OTHER, "Read Other",);
      await insertAssets(db, ownerId, "public.png", "image/png", "image" as never, 8, "raw/pu/blic/public.png", {
        id: "public-asset" as never,
        visibility: "public" as never,
      },);
      // Public + non-null actor (stranger, not owner) → can access
      expect(await canAccessAsset(db, "public-asset", strangerId, null,),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("a non-owner cannot access a private asset", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      await seedOwner(db, uploadDir,);
      const strangerId = await makeUser(db, OTHER, "Read Other",);
      expect(await canAccessAsset(db, ASSET_ID, strangerId, null,),).toBe(false,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("a non-owner can access a shared asset when they have a share row", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      const otherId = await makeUser(db, OTHER, "Read Other",);
      // asset_shares FKs reference actors.id — create actor mirror rows
      await db.insertInto("actors",).values({ id: ownerId, display_name: "Owner Actor", },).execute();
      await db.insertInto("actors",).values({ id: otherId, display_name: "Other Actor", },).execute();
      await insertAssets(db, ownerId, "shared.png", "image/png", "image" as never, 8, "raw/sh/are/shared.png", {
        id: "shared-asset" as never,
        visibility: "shared" as never,
      },);
      await db.insertInto("asset_shares",).values({
        id: "share-row-1",
        asset_id: "shared-asset",
        shared_with_id: otherId,
        shared_by_id: ownerId,
      },).execute();
      expect(await canAccessAsset(db, "shared-asset", otherId, null,),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("a non-owner cannot access a shared asset without a share row", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      const strangerId = await makeUser(db, OTHER, "Read Other",);
      await insertAssets(db, ownerId, "shared2.png", "image/png", "image" as never, 8, "raw/s2/shared2.png", {
        id: "shared2-asset" as never,
        visibility: "shared" as never,
      },);
      expect(await canAccessAsset(db, "shared2-asset", strangerId, null,),).toBe(false,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});

describe("listAssets", () => {
  test("admin sees all assets regardless of visibility", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      await seedOwner(db, uploadDir,);
      const otherId = await makeUser(db, OTHER, "Read Other",);
      await insertAssets(
        db,
        otherId,
        "other-private.png",
        "image/png",
        "image" as never,
        8,
        "raw/op/ther/other-private.png",
        { id: "other-private-asset" as never, visibility: "private" as never, },
      );
      const result = await listAssets(db, { actorRole: "admin", },);
      expect(result.data.length,).toBeGreaterThanOrEqual(2,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("non-admin with no filters sees own + public + shared-with-them", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      const otherId = await makeUser(db, OTHER, "Read Other",);
      await insertAssets(
        db,
        otherId,
        "other-public.png",
        "image/png",
        "image" as never,
        8,
        "raw/op/ublic/other-public.png",
        { id: "other-public-asset" as never, visibility: "public" as never, },
      );
      const result = await listAssets(db, { actorId: ownerId, },);
      expect(result.data.some((a,) => a.id === ASSET_ID),).toBe(true,);
      expect(result.data.some((a,) => a.id === "other-public-asset"),).toBe(true,);
      expect(result.data.some((a,) => a.id === "other-private-asset"),).toBe(false,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("filters by entityType", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      await db.insertInto("asset_links",).values({
        asset_id: ASSET_ID,
        entity_type: "character",
        entity_id: "char-linked",
      },).execute();
      const result = await listAssets(db, { entityType: "character", actorId: ownerId, },);
      expect(result.data.some((a,) => a.id === ASSET_ID),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("filters by entityId", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      await db.insertInto("asset_links",).values({
        asset_id: ASSET_ID,
        entity_type: "world",
        entity_id: "world-linked",
      },).execute();
      const result = await listAssets(db, { entityType: "world", entityId: "world-linked", actorId: ownerId, },);
      expect(result.data.some((a,) => a.id === ASSET_ID),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("filters by label", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      await db.insertInto("asset_links",).values({
        asset_id: ASSET_ID,
        entity_type: "character",
        entity_id: "char-1",
        label: "hero-portrait",
      },).execute();
      const result = await listAssets(db, {
        entityType: "character",
        entityId: "char-1",
        label: "hero-portrait",
        actorId: ownerId,
      },);
      expect(result.data.some((a,) => a.id === ASSET_ID),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("pagination limits results", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-read-",),);
    try {
      const ownerId = await seedOwner(db, uploadDir,);
      for (let i = 0; i < 3; i++) {
        await insertAssets(db, ownerId, `page${i}.png`, "image/png", "image" as never, 8, `raw/p${i}/page${i}.png`, {
          id: `page-asset-${i}` as never,
        },);
      }
      const page1 = await listAssets(db, { page: 1, pageSize: 2, actorId: ownerId, },);
      expect(page1.data.length,).toBeLessThanOrEqual(2,);
      expect(page1.total,).toBeGreaterThan(0,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});
