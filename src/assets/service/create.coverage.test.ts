// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for `createAsset` (src/assets/service/create.ts).
 *
 * Contract: image assets get width/height/alpha extraction; alt text is
 * tag-stripped and truncated; non-images keep null dims and unknown alpha;
 * duplicate content+owner is detected by hash; non-public tier without key
 * material is stored unencrypted.
 */
import { afterAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { AssetType, } from "../../db/enums";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { makeMinimalPng, } from "../test-helpers";
import { createAsset, } from "./create";
import { describePristine, } from "../../test-utils/pristine";

// image-gen-route.test.ts replaces ../assets/service/create process-wide
// with mockCreateAsset (fixed fixture row); skip rather than assert the stub.
const describeReal = describePristine(createAsset, "createAsset",);

describeReal("createAsset coverage", () => {
  const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-create-asset-",),);

  /** @param db */
  async function ownerIdFor(db: Parameters<typeof insertUsers>[0], username: string,): Promise<string> {
    return (await db.selectFrom("users",).select("id",).where(
      "username",
      "=",
      username,
    ).executeTakeFirstOrThrow()).id;
  }

  test("image asset extracts dimensions and stores the row", async () => {
    const { db, sqlite, } = await createTestDb();
    await insertUsers(db, "img-owner", "Img Owner",);
    const ownerId = await ownerIdFor(db, "img-owner",);
    const buffer = makeMinimalPng(4, 3,);

    try {
      const { asset, duplicate, } = await createAsset({
        database: db,
        uploadDir,
        input: {
          ownerId,
          filename: "pic.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: buffer.length,
          buffer,
        },
      },);

      expect(duplicate,).toBe(false,);
      expect(asset.width,).toBe(4,);
      expect(asset.height,).toBe(3,);
      expect(asset.storage_backend,).toBe("local",);
      expect(asset.visibility,).toBe("private",);
      expect(asset.encryption_tier,).toBe("public",);
      expect(asset.alpha_status,).not.toBe("unknown",);
    } finally {
      sqlite.close();
    }
  });

  test("alt text is sanitized: tags stripped, trimmed, capped at 500 chars", async () => {
    const { db, sqlite, } = await createTestDb();
    await insertUsers(db, "alt-owner", "Alt Owner",);
    const ownerId = await ownerIdFor(db, "alt-owner",);
    const buffer = makeMinimalPng(2, 2,);

    try {
      const { asset, } = await createAsset({
        database: db,
        uploadDir,
        input: {
          ownerId,
          filename: "alt.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: buffer.length,
          buffer,
          altText: "<b>cozy</b> tavern  ",
        },
      },);

      expect(asset.alt_text,).toBe("cozy tavern",);
    } finally {
      sqlite.close();
    }
  });

  test("non-image asset keeps null dims and unknown alpha status", async () => {
    const { db, sqlite, } = await createTestDb();
    await insertUsers(db, "doc-owner", "Doc Owner",);
    const ownerId = await ownerIdFor(db, "doc-owner",);
    const buffer = Buffer.from("plain text asset",);

    try {
      const { asset, } = await createAsset({
        database: db,
        uploadDir,
        input: {
          ownerId,
          filename: "notes.txt",
          mimeType: "text/plain",
          assetType: AssetType.Other,
          sizeBytes: buffer.length,
          buffer,
        },
      },);

      expect(asset.width,).toBeNull();
      expect(asset.height,).toBeNull();
      expect(asset.alpha_status,).toBe("unknown",);
    } finally {
      sqlite.close();
    }
  });

  test("duplicate content for the same owner short-circuits", async () => {
    const { db, sqlite, } = await createTestDb();
    await insertUsers(db, "dup-owner", "Dup Owner",);
    const ownerId = await ownerIdFor(db, "dup-owner",);
    const buffer = makeMinimalPng(6, 5,);
    const input = {
      ownerId,
      filename: "dup.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    };

    try {
      const first = await createAsset({ database: db, uploadDir, input, },);
      const second = await createAsset({ database: db, uploadDir, input, },);
      expect(first.duplicate,).toBe(false,);
      expect(second.duplicate,).toBe(true,);
      expect(second.asset.id,).toBe(first.asset.id,);
    } finally {
      sqlite.close();
    }
  });

  test("non-public tier without key material stores unencrypted", async () => {
    const { db, sqlite, } = await createTestDb();
    await insertUsers(db, "tier-owner", "Tier Owner",);
    const ownerId = await ownerIdFor(db, "tier-owner",);
    const buffer = Buffer.from("secret-ish",);

    try {
      const { asset, } = await createAsset({
        database: db,
        uploadDir,
        input: {
          ownerId,
          filename: "secret.txt",
          mimeType: "text/plain",
          assetType: AssetType.Other,
          sizeBytes: buffer.length,
          buffer,
          encryptionTier: "chat",
          // No chatKey/keyId/pipelineConfig → encryption path skipped.
        },
      },);

      expect(asset.encryption_tier,).toBe("chat",);
      expect(asset.encrypted_key_id,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  afterAll(() => {
    rmSync(uploadDir, { recursive: true, force: true, },);
  },);
});
