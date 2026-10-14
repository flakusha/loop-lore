// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/persist-generated.ts — the shared
 * generation→asset persistence contract.
 */
import { afterAll, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { AssetLinkEntity, AssetVisibility, } from "../../db/enums";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { describePristine, } from "../../test-utils/pristine";
import { makeMinimalPng, } from "../test-helpers";
import { createAsset, } from "./create";
import { getAssetLinks, } from "./links";
import { persistGeneratedImages, } from "./persist-generated";

// image-gen-route.test.ts replaces ../assets/service/create process-wide
// with mockCreateAsset (fixed fixture row); skip rather than assert the stub.
const describeReal = describePristine(createAsset, "createAsset",);

describeReal("persistGeneratedImages", () => {
  const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-persist-gen-",),);
  afterAll(() => {
    rmSync(uploadDir, { recursive: true, force: true, },);
  },);

  test("persists each buffer and links it with the label", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertUsers(db, "gen-owner", "Gen Owner",);
      const ownerId = (await db.selectFrom("users",).select("id",).where(
        "username",
        "=",
        "gen-owner",
      ).executeTakeFirstOrThrow()).id;

      const images = [makeMinimalPng(2, 2,), makeMinimalPng(3, 3,),];

      const persisted = await persistGeneratedImages({
        database: db,
        uploadDir,
        images,
        mimeType: "image/png",
        ownerId,
        altText: "generated sprite",
        links: [{ entityType: AssetLinkEntity.Character, entityId: "char-7", label: "emotion:happy", },],
        makeFilename: (index,) => `gen-${index}.png`,
      },);

      expect(persisted,).toHaveLength(2,);
      expect(persisted[0]!.asset.filename,).toBe("gen-0.png",);
      expect(persisted[1]!.asset.filename,).toBe("gen-1.png",);
      for (const { asset, } of persisted) {
        const links = await getAssetLinks(db, asset.id,);
        expect(links,).toHaveLength(1,);
        expect(links[0]!.entity_type,).toBe("character",);
        expect(links[0]!.entity_id,).toBe("char-7",);
        expect(links[0]!.label,).toBe("emotion:happy",);
      }
    } finally {
      sqlite.close();
    }
  });

  test("repeat persist of identical bytes with makeFilename creates a distinct item", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertUsers(db, "dup-owner", "Dup Owner",);
      const ownerId = (await db.selectFrom("users",).select("id",).where(
        "username",
        "=",
        "dup-owner",
      ).executeTakeFirstOrThrow()).id;

      const opts = {
        database: db,
        uploadDir,
        images: [makeMinimalPng(2, 2,),],
        mimeType: "image/png",
        ownerId,
        altText: "repeat",
        links: [{ entityType: AssetLinkEntity.Character, entityId: "char-8", },],
        makeFilename: () => "repeat.png",
      };

      const first = await persistGeneratedImages({ ...opts, images: [...opts.images,], },);
      const second = await persistGeneratedImages({ ...opts, images: [...opts.images,], },);

      // Label-keyed (makeFilename supplied): dedupe is off, so a regeneration
      // is a distinct row rather than inheriting the old one.
      expect(first[0]!.duplicate,).toBe(false,);
      expect(second[0]!.duplicate,).toBe(false,);
      expect(second[0]!.asset.id,).not.toBe(first[0]!.asset.id,);
      expect(second[0]!.asset.visibility,).toBe(AssetVisibility.Private,);

      const rows = await db.selectFrom("assets",).select("id",).execute();
      expect(rows.length,).toBe(2,);
    } finally {
      sqlite.close();
    }
  });

  test("content-addressed default dedupes identical bytes onto the existing row", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertUsers(db, "ca-owner", "CA Owner",);
      const ownerId = (await db.selectFrom("users",).select("id",).where(
        "username",
        "=",
        "ca-owner",
      ).executeTakeFirstOrThrow()).id;

      const image = makeMinimalPng(2, 2,);
      const opts = {
        database: db,
        uploadDir,
        images: [image,],
        mimeType: "image/png",
        ownerId,
        altText: "content-addressed",
        links: [{ entityType: AssetLinkEntity.Character, entityId: "char-9", },],
      };

      const first = await persistGeneratedImages({ ...opts, },);
      const second = await persistGeneratedImages({ ...opts, },);

      // No makeFilename → content-addressed: the second run collapses onto the
      // existing row via the content_hash unique index.
      expect(first[0]!.duplicate,).toBe(false,);
      expect(second[0]!.duplicate,).toBe(true,);
      expect(second[0]!.asset.id,).toBe(first[0]!.asset.id,);

      // Filename is the SHA-256 of the bytes, not a UUID.
      expect(first[0]!.asset.filename,).toMatch(/^[0-9a-f]{64}\.png$/,);

      const rows = await db.selectFrom("assets",).select("id",).execute();
      expect(rows.length,).toBe(1,);
    } finally {
      sqlite.close();
    }
  });

  test("empty image list persists nothing", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const persisted = await persistGeneratedImages({
        database: db,
        uploadDir,
        images: [],
        mimeType: "image/png",
        ownerId: "nobody",
        altText: "nothing",
        links: [{ entityType: AssetLinkEntity.Character, entityId: "char-0", },],
      },);

      expect(persisted,).toEqual([],);
    } finally {
      sqlite.close();
    }
  });

  test("passes encryption context through to createAsset", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertUsers(db, "enc-owner", "Enc Owner",);
      const ownerId = (await db.selectFrom("users",).select("id",).where(
        "username",
        "=",
        "enc-owner",
      ).executeTakeFirstOrThrow()).id;

      const persisted = await persistGeneratedImages({
        database: db,
        uploadDir,
        images: [makeMinimalPng(2, 2,),],
        mimeType: "image/png",
        ownerId,
        altText: "encrypted",
        links: [{ entityType: AssetLinkEntity.Character, entityId: "char-enc", },],
        encryptionTier: "standard",
        chatKey: null,
        keyId: null,
        pipelineConfig: undefined,
      },);

      expect(persisted,).toHaveLength(1,);
      expect(persisted[0]!.asset.encryption_tier,).toBe("standard",);
    } finally {
      sqlite.close();
    }
  });
},);
