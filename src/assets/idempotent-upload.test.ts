/**
 * Tests for idempotent upload — SHA-256 hash-based duplicate detection
 * in `createAsset` (src/assets/service.ts).
 *
 * Uploading the same file content for the same owner must return the
 * existing asset instead of creating a duplicate.
 */

import { describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { AssetType, AssetVisibility, } from "../db/enums";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { createAsset, getAssetShares, shareAsset, } from "./service";
import type { CreateAssetInput, } from "./service";
import { makeMinimalPng, } from "./test-helpers";

describe("createAsset idempotent upload", () => {
  test("uploading the same file content returns duplicate:true with the existing asset", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-asset-test-",),);
    await insertUsers(db, "idempotent-test", "Idempotent Test",);
    await insertUsers(db, "other-user", "Other User",);
    const ownerId = (await db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "idempotent-test",)
      .executeTakeFirstOrThrow()).id;

    const otherOwnerId = (await db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "other-user",)
      .executeTakeFirstOrThrow()).id;

    const buffer = makeMinimalPng(4, 3,);

    const base: CreateAssetInput = {
      ownerId,
      filename: "scene.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    };

    try {
      // First upload creates the asset, no duplicate.
      const first = await createAsset({ database: db, input: base, uploadDir, },);
      expect(first.duplicate,).toBe(false,);
      expect(first.asset.id,).toBeTruthy();

      // Second upload with identical content + owner must return the same asset.
      const second = await createAsset({ database: db, input: base, uploadDir, },);
      expect(second.duplicate,).toBe(true,);
      expect(second.asset.id,).toBe(first.asset.id,);

      // Same file but a different owner is NOT a duplicate (owner-scoped).
      const otherOwner = await createAsset({
        database: db,
        input: { ...base, ownerId: otherOwnerId, },
        uploadDir,
      },);

      expect(otherOwner.duplicate,).toBe(false,);
      expect(otherOwner.asset.id,).not.toBe(first.asset.id,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("different file content creates a new asset (no false duplicate)", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-asset-test-",),);
    await insertUsers(db, "diff-content", "Diff Content",);
    const ownerId = (await db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "diff-content",)
      .executeTakeFirstOrThrow()).id;

    const firstBuffer = makeMinimalPng(4, 3,);
    const secondBuffer = makeMinimalPng(8, 6,);

    try {
      const first = await createAsset({
        database: db,
        input: {
          ownerId,
          filename: "a.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: firstBuffer.length,
          buffer: firstBuffer,
        },
        uploadDir,
      },);

      const second = await createAsset({
        database: db,
        input: {
          ownerId,
          filename: "b.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: secondBuffer.length,
          buffer: secondBuffer,
        },
        uploadDir,
      },);

      expect(first.duplicate,).toBe(false,);
      expect(second.duplicate,).toBe(false,);
      expect(second.asset.id,).not.toBe(first.asset.id,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("dedupe:false spawns a new item instead of collapsing onto an existing row", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-asset-test-",),);
    await insertUsers(db, "edit-owner", "Edit Owner",);
    await insertUsers(db, "stranger", "Stranger",);
    const ownerId = (await db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "edit-owner",)
      .executeTakeFirstOrThrow()).id;

    const strangerId = (await db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "stranger",)
      .executeTakeFirstOrThrow()).id;

    const buffer = makeMinimalPng(4, 3,);

    try {
      const first = await createAsset({
        database: db,
        input: {
          ownerId,
          filename: "scene.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: buffer.length,
          buffer,
        },
        uploadDir,
      },);

      // The source is public and shared with a stranger — an iteration must not
      // inherit either of those.
      await db
        .updateTable("assets",)
        .set({ visibility: AssetVisibility.Public, },)
        .where("id", "=", first.asset.id,)
        .execute();

      await shareAsset({
        database: db,
        assetId: first.asset.id,
        sharedWithId: strangerId,
        sharedById: ownerId,
      },);

      // An edit that reproduces the exact same bytes is still a new iteration.
      const edit = await createAsset({
        database: db,
        input: {
          ownerId,
          filename: "edit-abcd1234.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: buffer.length,
          buffer,
          altText: "Edited: brighter",
          dedupe: false,
        },
        uploadDir,
      },);

      expect(edit.duplicate,).toBe(false,);
      expect(edit.asset.id,).not.toBe(first.asset.id,);
      // The new iteration keeps its own metadata rather than the source's.
      expect(edit.asset.filename,).toBe("edit-abcd1234.png",);
      expect(edit.asset.alt_text,).toBe("Edited: brighter",);
      // Visibility defaults to private regardless of the source row's.
      expect(edit.asset.visibility,).toBe(AssetVisibility.Private,);

      const shares = await getAssetShares(db, edit.asset.id,);
      expect(shares,).toEqual([],);

      const rows = await db.selectFrom("assets",).select("id",).execute();
      expect(rows.length,).toBe(2,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});
