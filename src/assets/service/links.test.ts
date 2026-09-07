// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/links.ts — entity linking with the
 * duplicate-relink no-op and FK-propagation behavior.
 */

import { describe, expect, test, } from "bun:test";
import { AssetLinkEntity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { Kysely, } from "kysely";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssetLinks, insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { getAssetLinks, linkAsset, unlinkAsset, } from "./links";

const ASSET_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const OWNER = "link-owner";

async function seedAsset(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, OWNER, "Link Owner",);
  const owner = await db.selectFrom("users",).select("id",).where("username", "=", OWNER,).executeTakeFirstOrThrow();
  await insertAssets(
    db,
    owner.id,
    "linked.png",
    "image/png",
    "image" as never,
    10,
    "raw/aa/bb/file.png",
    { id: ASSET_ID as never, },
  );
}

describe("linkAsset", () => {
  test("inserts a link row with a label", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seedAsset(db,);
      await linkAsset({
        database: db,
        assetId: ASSET_ID,
        link: { entityType: AssetLinkEntity.Character, entityId: "char-1", label: "hero portrait", },
      },);
      const links = await getAssetLinks(db, ASSET_ID,);
      expect(links,).toHaveLength(1,);
      expect(links[0]!.entity_type,).toBe("character",);
      expect(links[0]!.entity_id,).toBe("char-1",);
      expect(links[0]!.label,).toBe("hero portrait",);
    } finally {
      sqlite.close();
    }
  });

  test("defaults label to null when omitted", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seedAsset(db,);
      await linkAsset({
        database: db,
        assetId: ASSET_ID,
        link: { entityType: AssetLinkEntity.World, entityId: "world-9", },
      },);
      const links = await getAssetLinks(db, ASSET_ID,);
      expect(links[0]!.label,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("re-linking the same asset/entity pair is a silent no-op", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seedAsset(db,);
      const link = { entityType: AssetLinkEntity.Character, entityId: "char-1", } as const;
      await linkAsset({ database: db, assetId: ASSET_ID, link, },);
      // Second insert violates pk_asset_links — swallowed, no label overwrite
      await linkAsset({
        database: db,
        assetId: ASSET_ID,
        link: { ...link, label: "changed", },
      },);
      const links = await getAssetLinks(db, ASSET_ID,);
      expect(links,).toHaveLength(1,);
      expect(links[0]!.label,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("propagates non-UNIQUE failures (FK violation for a missing asset)", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await expect(linkAsset({
        database: db,
        assetId: "nonexistent-asset",
        link: { entityType: AssetLinkEntity.Chat, entityId: "chat-1", },
      },),).rejects.toThrow("FOREIGN KEY constraint failed");
    } finally {
      sqlite.close();
    }
  });
});

describe("unlinkAsset", () => {
  test("removes only the matching entity link", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seedAsset(db,);
      await insertAssetLinks(db, ASSET_ID, AssetLinkEntity.Character, "char-1",);
      await insertAssetLinks(db, ASSET_ID, AssetLinkEntity.World, "world-1",);

      await unlinkAsset({
        database: db,
        assetId: ASSET_ID,
        entityType: AssetLinkEntity.Character,
        entityId: "char-1",
      },);

      const links = await getAssetLinks(db, ASSET_ID,);
      expect(links,).toHaveLength(1,);
      expect(links[0]!.entity_type,).toBe("world",);
    } finally {
      sqlite.close();
    }
  });

  test("unlinking a non-existent link is a no-op", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seedAsset(db,);
      await expect(unlinkAsset({
        database: db,
        assetId: ASSET_ID,
        entityType: AssetLinkEntity.Item,
        entityId: "ghost",
      },),).resolves.toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
});

describe("getAssetLinks", () => {
  test("returns an empty array for an asset without links", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seedAsset(db,);
      expect(await getAssetLinks(db, ASSET_ID,),).toEqual([],);
    } finally {
      sqlite.close();
    }
  });

  test("returns only the links of the requested asset", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seedAsset(db,);
      const owner = await db.selectFrom("users",).select("id",).where("username", "=", OWNER,).executeTakeFirstOrThrow();
      await insertAssets(
        db,
        owner.id,
        "other.png",
        "image/png",
        "image" as never,
        5,
        "raw/aa/bb/other.png",
        { id: "other-asset" as never, },
      );
      await insertAssetLinks(db, ASSET_ID, AssetLinkEntity.Memory, "mem-1", { label: "flashback", },);
      await insertAssetLinks(db, "other-asset", AssetLinkEntity.Memory, "mem-2",);

      const links = await getAssetLinks(db, ASSET_ID,);
      expect(links,).toHaveLength(1,);
      expect(links[0]!.entity_id,).toBe("mem-1",);
      expect(links[0]!.label,).toBe("flashback",);
    } finally {
      sqlite.close();
    }
  });
});
