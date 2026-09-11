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
import { AssetLinkEntity, } from "../../db/enums";
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
        link: { entityType: AssetLinkEntity.Character, entityId: "char-7", label: "emotion:happy", },
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

  test("flags duplicate content on repeat persist", async () => {
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
        link: { entityType: AssetLinkEntity.Character, entityId: "char-8", },
        makeFilename: () => "repeat.png",
      } as const;
      const first = await persistGeneratedImages({ ...opts, images: [...opts.images,], },);
      const second = await persistGeneratedImages({ ...opts, images: [...opts.images,], },);
      expect(first[0]!.duplicate,).toBe(false,);
      expect(second[0]!.duplicate,).toBe(true,);
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
        link: { entityType: AssetLinkEntity.Character, entityId: "char-0", },
        makeFilename: () => "nothing.png",
      },);
      expect(persisted,).toEqual([],);
    } finally {
      sqlite.close();
    }
  });
},);
