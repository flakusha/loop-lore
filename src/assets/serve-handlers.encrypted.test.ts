// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Encrypted-asset preview guard: `/thumb` and `/compressed` must refuse an
 * encrypted asset (400) instead of serving a plaintext thumbnail or the raw
 * ciphertext, and no plaintext thumbnail may be written for an encrypted
 * asset in the first place.
 *
 * Resource contract (parallel-safe): every test owns its own resources — a
 * fresh in-memory SQLite DB (`createTestDb`) and a fresh
 * `mkdtempSync(tmpdir(), "ll-enc-preview-")` upload dir, both released by
 * `cleanup()` in `finally`. No shared mutable module state: the chat key is
 * generated per test and `initSmk` is never called, so `getSmk()` stays null.
 * Each test passes standalone, in any order, and under concurrent execution.
 */
import type { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import sharp, {} from "sharp";
import type { ChatKey, } from "../crypto/chat-keys";
import { AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { isEncryptedAsset, } from "./encryption";
import { handleServeCompressed, } from "./serve-handlers";
import { handleServeRaw, } from "./serve-raw";
import { createAsset, deleteAsset, } from "./service";

const KEY_ID = "test-chat-key-id";
const PIPELINE_CONFIG = { threshold: 128, algorithm: "gzip" as const, };

interface Fixture {
  db: Kysely<DB>;
  sqlite: Database;
  uploadDir: string;
  ownerId: string;
}

/** Build a real PNG buffer via sharp (sharp needs actual pixel data). */
async function makeRealPng(width: number, height: number,): Promise<Buffer> {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 120, b: 200, },
    },
  },).png().toBuffer();
}

/** A throwaway chat key — the blob is encrypted for real, under this key id. */
async function makeChatKey(): Promise<ChatKey> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256, }, true, ["encrypt", "decrypt",],);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key,),);
  return { key, keyId: KEY_ID, rawKey, };
}

async function seed(): Promise<Fixture> {
  const { db, sqlite, } = await createTestDb();
  const uploadDir = mkdtempSync(join(tmpdir(), "ll-enc-preview-",),);
  const ownerId = randomUUID();
  await insertUsers(db, `enc-owner-${ownerId}`, "Encrypted Owner", { id: ownerId, } as never,);
  return { db, sqlite, uploadDir, ownerId, };
}

/** Create an asset, encrypted for real when `encrypted` is set. */
async function addAsset({
  fx,
  encrypted,
  filename,
}: {
  fx: Fixture;
  encrypted: boolean;
  filename: string;
},): Promise<string> {
  const buffer = await makeRealPng(16, 12,);
  const chatKey = encrypted ? await makeChatKey() : null;
  const { asset, } = await createAsset({
    database: fx.db,
    input: {
      ownerId: fx.ownerId,
      filename,
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
      encryptionTier: encrypted ? "standard" : "public",
      chatKey,
      keyId: encrypted ? KEY_ID : null,
      pipelineConfig: encrypted ? PIPELINE_CONFIG : undefined,
    },
    uploadDir: fx.uploadDir,
  },);

  return asset.id;
}

async function cleanup(fx: Fixture,) {
  await fx.db.destroy();
  fx.sqlite.close();
  rmSync(fx.uploadDir, { recursive: true, force: true, },);
}

describe("encrypted asset previews", () => {
  test("/thumb refuses an encrypted asset with 400 and no image bytes", async () => {
    const fx = await seed();
    try {
      const assetId = await addAsset({ fx, encrypted: true, filename: "secret.png", },);

      const res = await handleServeCompressed({
        database: fx.db,
        assetId,
        uploadDir: fx.uploadDir,
        variant: "thumb",
        actorId: fx.ownerId,
        actorRole: "user",
      },);

      expect(res.status,).toBe(400,);
      const body = await res.text();
      expect(body,).toBe("Encrypted asset preview requires the raw endpoint",);
      expect(body.includes("RIFF",),).toBe(false,);
      expect(body.includes("WEBP",),).toBe(false,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("/compressed refuses an encrypted asset with 400", async () => {
    const fx = await seed();
    try {
      const assetId = await addAsset({ fx, encrypted: true, filename: "secret2.png", },);

      const res = await handleServeCompressed({
        database: fx.db,
        assetId,
        uploadDir: fx.uploadDir,
        variant: "compressed",
        actorId: fx.ownerId,
        actorRole: "user",
      },);

      expect(res.status,).toBe(400,);
      expect(await res.text(),).toBe("Encrypted asset preview requires the raw endpoint",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("a public asset still serves its thumbnail as image/webp", async () => {
    const fx = await seed();
    try {
      const assetId = await addAsset({ fx, encrypted: false, filename: "public.png", },);

      const res = await handleServeCompressed({
        database: fx.db,
        assetId,
        uploadDir: fx.uploadDir,
        variant: "thumb",
        actorId: fx.ownerId,
        actorRole: "user",
      },);

      expect(res.status,).toBe(200,);
      expect(res.headers.get("content-type",),).toBe("image/webp",);
      const body = Buffer.from(await res.arrayBuffer(),);
      expect(body.length,).toBeGreaterThan(0,);
      expect(body.subarray(0, 4,).toString("ascii",),).toBe("RIFF",);
    } finally {
      await cleanup(fx,);
    }
  });

  test("creating an encrypted asset writes no thumbnail file and leaves thumbnail_path null", async () => {
    const fx = await seed();
    try {
      const assetId = await addAsset({ fx, encrypted: true, filename: "secret3.png", },);

      const row = await fx.db
        .selectFrom("assets",)
        .select(["encryption_tier", "encrypted_key_id", "thumbnail_path",],)
        .where("id", "=", assetId,)
        .executeTakeFirstOrThrow();

      expect(row.encryption_tier,).toBe("standard",);
      expect(row.encrypted_key_id,).toBe(KEY_ID,);
      expect(row.thumbnail_path,).toBeNull();

      const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
      expect(existsSync(join(fx.uploadDir, "compressed", subDir,),),).toBe(false,);
    } finally {
      await cleanup(fx,);
    }
  });

  test("deleting an asset removes its thumbnail file from disk", async () => {
    const fx = await seed();
    try {
      const assetId = await addAsset({ fx, encrypted: false, filename: "deletable.png", },);

      const row = await fx.db
        .selectFrom("assets",)
        .select("thumbnail_path",)
        .where("id", "=", assetId,)
        .executeTakeFirstOrThrow();

      expect(row.thumbnail_path,).not.toBeNull();
      const thumbPath = join(fx.uploadDir, row.thumbnail_path!,);
      expect(existsSync(thumbPath,),).toBe(true,);
      expect(readFileSync(thumbPath,).length,).toBeGreaterThan(0,);

      expect(await deleteAsset({ database: fx.db, assetId, uploadDir: fx.uploadDir, },),).toBe(true,);
      expect(existsSync(thumbPath,),).toBe(false,);
    } finally {
      await cleanup(fx,);
    }
  });

  describe("isEncryptedAsset", () => {
    test("public asset is not encrypted", () => {
      expect(isEncryptedAsset({ encryption_tier: "public", encrypted_key_id: null, },),).toBe(false,);
    });

    test("non-public with key is encrypted", () => {
      expect(isEncryptedAsset({ encryption_tier: "standard", encrypted_key_id: KEY_ID, },),).toBe(true,);
    });

    test("non-public without key is not encrypted", () => {
      expect(isEncryptedAsset({ encryption_tier: "standard", encrypted_key_id: null, },),).toBe(false,);
    });

    test("public with key is not encrypted", () => {
      expect(isEncryptedAsset({ encryption_tier: "public", encrypted_key_id: KEY_ID, },),).toBe(false,);
    });
  });

  describe("handleServeRaw encrypted asset", () => {
    test("requires chat context for encrypted asset", async () => {
      const fx = await seed();
      try {
        const assetId = await addAsset({ fx, encrypted: true, filename: "secret-raw.png", },);

        const res = await handleServeRaw({
          database: fx.db,
          assetId,
          uploadDir: fx.uploadDir,
          actorId: fx.ownerId,
          actorRole: "user",
        },);

        expect(res.status,).toBe(400,);
        expect(await res.text(),).toBe("Encrypted asset requires chat context",);
      } finally {
        await cleanup(fx,);
      }
    });
  });
});
