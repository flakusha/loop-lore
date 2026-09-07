// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/shares.ts — visibility updates and
 * owner-gated share bookkeeping (with visibility auto-escalation).
 */

import { describe, expect, test, } from "bun:test";
import { AssetVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { Kysely, } from "kysely";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssetShares, insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import {
  getAssetShares,
  shareAsset,
  unshareAsset,
  updateAssetVisibility,
} from "./shares";

const ASSET_ID = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const OWNER = "share-owner";
const PEER = "share-peer";
const THIRD = "share-third";

async function seed(db: Kysely<DB>,): Promise<{ ownerId: string; peerId: string; thirdId: string }> {
  await insertUsers(db, OWNER, "Share Owner",);
  await insertUsers(db, PEER, "Share Peer",);
  await insertUsers(db, THIRD, "Share Third",);
  const users = await db.selectFrom("users",).select(["id", "username",],).execute();
  const ownerId = users.find((u,) => u.username === OWNER,)!.id;
  const peerId = users.find((u,) => u.username === PEER,)!.id;
  const thirdId = users.find((u,) => u.username === THIRD,)!.id;
  // asset_shares FKs point at actors.id — mirror each user as an actor
  await db.insertInto("actors",).values({ id: ownerId, display_name: "Owner Actor", },).execute();
  await db.insertInto("actors",).values({ id: peerId, display_name: "Peer Actor", },).execute();
  await db.insertInto("actors",).values({ id: thirdId, display_name: "Third Actor", },).execute();
  await insertAssets(
    db,
    ownerId,
    "shared.png",
    "image/png",
    "image" as never,
    10,
    "raw/b1/a2/shared.png",
    { id: ASSET_ID as never, },
  );
  return { ownerId, peerId, thirdId, };
}

describe("updateAssetVisibility", () => {
  test("returns null for a missing asset", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      expect(await updateAssetVisibility({
        database: db,
        assetId: "ghost",
        visibility: AssetVisibility.Public,
        actorId: "someone",
      },),).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("returns null when the actor is not the owner", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { peerId, } = await seed(db,);
      expect(await updateAssetVisibility({
        database: db,
        assetId: ASSET_ID,
        visibility: AssetVisibility.Public,
        actorId: peerId,
      },),).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("owner can change visibility and the DB row is updated", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { ownerId, } = await seed(db,);
      const updated = await updateAssetVisibility({
        database: db,
        assetId: ASSET_ID,
        visibility: AssetVisibility.Public,
        actorId: ownerId,
      },);
      expect(updated,).not.toBeNull();
      expect(updated!.visibility,).toBe("public",);
      expect(updated!.id,).toBe(ASSET_ID,);
      const row = await db.selectFrom("assets",).select("visibility",).where("id", "=", ASSET_ID,).executeTakeFirstOrThrow();
      expect(row.visibility,).toBe("public",);
    } finally {
      sqlite.close();
    }
  });
});

describe("shareAsset", () => {
  test("returns null for a missing asset", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      expect(await shareAsset({
        database: db,
        assetId: "ghost",
        sharedWithId: "a",
        sharedById: "b",
      },),).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("returns null when the sharer is not the owner", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { peerId, } = await seed(db,);
      // peerId is not the owner — shareAsset owner check returns null
      expect(await shareAsset({
        database: db,
        assetId: ASSET_ID,
        sharedWithId: peerId,
        sharedById: peerId,
      },),).toBeNull();
      expect(await getAssetShares(db, ASSET_ID,),).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  test("creates a share row and escalates a private asset to shared", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { ownerId, peerId, } = await seed(db,);
      const share = await shareAsset({
        database: db,
        assetId: ASSET_ID,
        sharedWithId: peerId,
        sharedById: ownerId,
      },);
      expect(share,).not.toBeNull();
      expect(share!.asset_id,).toBe(ASSET_ID,);
      expect(share!.shared_with_id,).toBe(peerId,);
      expect(share!.shared_by_id,).toBe(ownerId,);
      expect(share!.id,).toBeTruthy();
      expect(share!.created_at,).toBeTruthy();
      const asset = await db.selectFrom("assets",).select("visibility",).where("id", "=", ASSET_ID,).executeTakeFirstOrThrow();
      expect(asset.visibility,).toBe("shared",);
      const rows = await getAssetShares(db, ASSET_ID,);
      expect(rows,).toHaveLength(1,);
    } finally {
      sqlite.close();
    }
  });

  test("does not downgrade an already-public asset when sharing", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { ownerId, peerId, } = await seed(db,);
      await db.updateTable("assets",).set({ visibility: "public", },).where("id", "=", ASSET_ID,).execute();
      const share = await shareAsset({
        database: db,
        assetId: ASSET_ID,
        sharedWithId: peerId,
        sharedById: ownerId,
      },);
      expect(share,).not.toBeNull();
      const asset = await db.selectFrom("assets",).select("visibility",).where("id", "=", ASSET_ID,).executeTakeFirstOrThrow();
      expect(asset.visibility,).toBe("public",);
    } finally {
      sqlite.close();
    }
  });

  test("returns null when the share insert fails (FK violation on sharedWith)", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { ownerId, } = await seed(db,);
      // sharedWithId is not an existing actor — FK failure caught → null
      expect(await shareAsset({
        database: db,
        assetId: ASSET_ID,
        sharedWithId: "no-such-actor",
        sharedById: ownerId,
      },),).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});

describe("unshareAsset", () => {
  test("removes the share row for the target actor", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { ownerId, peerId, thirdId, } = await seed(db,);
      // Each share needs a valid shared_by (ownerId) and shared_with actor
      await insertAssetShares(db, ASSET_ID, peerId, ownerId,);
      await insertAssetShares(db, ASSET_ID, thirdId, ownerId,);

      await unshareAsset({ database: db, assetId: ASSET_ID, sharedWithId: peerId, },);

      const rows = await getAssetShares(db, ASSET_ID,);
      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.shared_with_id,).toBe(thirdId,);
    } finally {
      sqlite.close();
    }
  });

  test("unsharing when nothing is shared is a no-op", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seed(db,);
      await expect(unshareAsset({ database: db, assetId: ASSET_ID, sharedWithId: "nobody", },),)
        .resolves.toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
});

describe("getAssetShares", () => {
  test("returns an empty array when the asset has no shares", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await seed(db,);
      expect(await getAssetShares(db, ASSET_ID,),).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
