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
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { makeMinimalPng, } from "./test-helpers";
import { createAsset, } from "./service";
import { AssetType, } from "../db/enums";
import type { CreateAssetInput, } from "./service";

describe("createAsset idempotent upload", () => {
  test("uploading the same file content returns duplicate:true with the existing asset", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-asset-test-",),);
    await insertUsers(db, "idempotent-test", "Idempotent Test",);
    await insertUsers(db, "other-user", "Other User",);
    const ownerId = (await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow()).id;
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
      expect(first.duplicate).toBe(false,);
      expect(first.asset.id).toBeTruthy();

      // Second upload with identical content + owner must return the same asset.
      const second = await createAsset({ database: db, input: base, uploadDir, },);
      expect(second.duplicate).toBe(true,);
      expect(second.asset.id).toBe(first.asset.id,);

      // Same file but a different owner is NOT a duplicate (owner-scoped).
      const otherOwner = await createAsset({
        database: db,
        input: { ...base, ownerId: otherOwnerId, },
        uploadDir,
      },);
      expect(otherOwner.duplicate).toBe(false,);
      expect(otherOwner.asset.id).not.toBe(first.asset.id,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  },);

  test("different file content creates a new asset (no false duplicate)", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-asset-test-",),);
    await insertUsers(db, "diff-content", "Diff Content",);
    const ownerId = (await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow()).id;

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

      expect(first.duplicate).toBe(false,);
      expect(second.duplicate).toBe(false,);
      expect(second.asset.id).not.toBe(first.asset.id,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  },);
});
