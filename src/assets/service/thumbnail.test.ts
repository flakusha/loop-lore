// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for asset thumbnail generation on upload.
 *
 * Covers:
 *   - 256px WebP generation: file written, thumbnail_path persisted.
 *   - Non-image assets (audio/mime=application): no thumb written, path null.
 *   - Dedupe interaction: re-uploading the same content returns duplicate:true
 *     and does not regenerate the thumbnail file.
 *   - handleServeCompressed prefers asset.thumbnail_path over the legacy
 *     deterministic path.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { existsSync, mkdtempSync, readFileSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import sharp, {} from "sharp";
import { AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { handleServeCompressed, } from "../serve-handlers";
import { createAsset, getAsset, } from "../service";
import type { CreateAssetInput, } from "../service";

/** Build a real PNG buffer via sharp (decodable). makeMinimalPng only emits
 *  valid headers for the parser tests — sharp needs actual pixel data. */
async function makeRealPng(width: number, height: number,): Promise<Buffer> {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50, },
    },
  },).png().toBuffer();
}

async function ownerIdFor(db: Kysely<DB>, username: string,): Promise<string> {
  await insertUsers(db, username, "User",);
  const row = await db
    .selectFrom("users",)
    .select("id",)
    .where("username", "=", username,)
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("createAsset thumbnail generation", () => {
  test("uploads a PNG and writes a 256px WebP thumbnail to compressed/<sub>/<id>_thumb.webp", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-thumb-",),);
    const ownerId = await ownerIdFor(db, "thumb-png-owner",);
    const buffer = await makeRealPng(64, 48,);

    try {
      const input: CreateAssetInput = {
        ownerId,
        filename: "sample.png",
        mimeType: "image/png",
        assetType: AssetType.Image,
        sizeBytes: buffer.length,
        buffer,
      };
      const result = await createAsset({ database: db, input, uploadDir, },);
      expect(result.duplicate,).toBe(false,);
      expect(result.asset.thumbnail_path,).not.toBeNull();

      const fullPath = join(uploadDir, result.asset.thumbnail_path!,);
      expect(existsSync(fullPath,),).toBe(true,);

      const meta = await sharp(fullPath,).metadata();
      expect(meta.format,).toBe("webp",);
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0,);
      expect(longest,).toBeLessThanOrEqual(256,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("non-image asset (audio) does not generate a thumbnail", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-thumb-",),);
    const ownerId = await ownerIdFor(db, "thumb-audio-owner",);
    const buffer = Buffer.from("not really audio",);

    try {
      const input: CreateAssetInput = {
        ownerId,
        filename: "track.mp3",
        mimeType: "audio/mpeg",
        assetType: AssetType.Audio,
        sizeBytes: buffer.length,
        buffer,
      };
      const result = await createAsset({ database: db, input, uploadDir, },);
      expect(result.duplicate,).toBe(false,);
      expect(result.asset.thumbnail_path,).toBeNull();

      const subDir = `${result.asset.id.slice(0, 2,)}/${result.asset.id.slice(2, 4,)}`;
      expect(existsSync(join(uploadDir, "compressed", subDir,),),).toBe(false,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("re-uploading the same content returns duplicate:true and does NOT regenerate the thumbnail file", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-thumb-",),);
    const ownerId = await ownerIdFor(db, "thumb-dedupe-owner",);
    const buffer = await makeRealPng(8, 8,);

    try {
      const input: CreateAssetInput = {
        ownerId,
        filename: "dup.png",
        mimeType: "image/png",
        assetType: AssetType.Image,
        sizeBytes: buffer.length,
        buffer,
      };
      const first = await createAsset({ database: db, input, uploadDir, },);
      const thumbPath = first.asset.thumbnail_path!;
      const fullThumbPath = join(uploadDir, thumbPath,);
      const originalBytes = readFileSync(fullThumbPath,);

      const second = await createAsset({ database: db, input, uploadDir, },);
      expect(second.duplicate,).toBe(true,);
      expect(second.asset.id,).toBe(first.asset.id,);
      expect(second.asset.thumbnail_path,).toBe(thumbPath,);

      const afterBytes = readFileSync(fullThumbPath,);
      expect(afterBytes.equals(originalBytes,),).toBe(true,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("handleServeCompressed serves the thumbnail_path bytes for variant=thumb", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-thumb-",),);
    const ownerId = await ownerIdFor(db, "thumb-serve-owner",);
    const buffer = await makeRealPng(32, 24,);

    try {
      const input: CreateAssetInput = {
        ownerId,
        filename: "serve.png",
        mimeType: "image/png",
        assetType: AssetType.Image,
        sizeBytes: buffer.length,
        buffer,
      };
      const created = await createAsset({ database: db, input, uploadDir, },);
      const asset = await getAsset(db, created.asset.id,);
      expect(asset?.thumbnail_path,).not.toBeNull();

      const res = await handleServeCompressed({
        database: db,
        assetId: created.asset.id,
        uploadDir,
        variant: "thumb",
        actorId: ownerId,
        actorRole: "user",
      },);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("Content-Type",),).toBe("image/webp",);
      const body = Buffer.from(await res.arrayBuffer(),);
      expect(body.length,).toBeGreaterThan(0,);
      const meta = await sharp(body,).metadata();
      expect(meta.format,).toBe("webp",);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});
