// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Visibility filter tests — public, owned, shared-with-me, and the
 * gallery variant that also admits public-character links.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ActorType, ActorVisibility, AssetLinkEntity, AssetType, AssetVisibility, } from "../../../../../src/db/enums";
import type { DB, } from "../../../../../src/db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../../../src/test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertAssetShares,
  insertUsers,
} from "../../../../../src/test-utils/insert-helpers";
import { canAccessAsset, listAssets, visibleAssetFilter, visibleGalleryAssetFilter, } from "./read";

let fixture: TestDb | undefined;
let db: Kysely<DB>;

async function freshDb(): Promise<void> {
  fixture = await createTestDb();
  db = fixture.db;
}

async function teardown(): Promise<void> {
  if (fixture) {
    await destroyTestDb(fixture,);
    fixture = undefined;
  }
}

async function visibleIds(actorId: string | null,): Promise<string[]> {
  const rows = await db
    .selectFrom("assets",)
    .select("id",)
    .where((eb,) => visibleAssetFilter(eb, actorId,))
    .execute();

  return rows.map((r,) => r.id).sort();
}

async function seedUsers(): Promise<{ ownerId: string; viewerId: string }> {
  const ownerId = await insertUsers(db, "vis-owner", "Vis Owner",);
  const viewerId = await insertUsers(db, "vis-viewer", "Vis Viewer",);
  // asset_shares FKs point at actors.id — mirror each user as an actor.
  await db.insertInto("actors",).values({ id: ownerId, display_name: "Vis Owner", },).execute();
  await db.insertInto("actors",).values({ id: viewerId, display_name: "Vis Viewer", },).execute();
  return { ownerId, viewerId, };
}

async function seedAsset(ownerId: string, visibility: AssetVisibility,): Promise<string> {
  return insertAssets(db, ownerId, `${visibility}.png`, "image/png", AssetType.Image, 8, `/${visibility}.png`, {
    visibility,
  },);
}

describe("visibleAssetFilter", () => {
  test("owner sees own private asset; stranger and nobody see it", async () => {
    await freshDb();
    try {
      const { ownerId, viewerId, } = await seedUsers();
      const id = await seedAsset(ownerId, AssetVisibility.Private,);

      await expect(visibleIds(ownerId,),).resolves.toEqual([id,],);
      await expect(visibleIds(viewerId,),).resolves.toEqual([],);
      await expect(visibleIds(null,),).resolves.toEqual([],);
    } finally {
      await teardown();
    }
  });

  test("public assets are visible to everyone including logged-out", async () => {
    await freshDb();
    try {
      const { ownerId, viewerId, } = await seedUsers();
      const id = await seedAsset(ownerId, AssetVisibility.Public,);

      await expect(visibleIds(viewerId,),).resolves.toEqual([id,],);
      await expect(visibleIds(null,),).resolves.toEqual([id,],);
    } finally {
      await teardown();
    }
  });

  test("shared-with-me is visible to the grantee in joined (prefixed) queries", async () => {
    await freshDb();
    try {
      const { ownerId, viewerId, } = await seedUsers();
      const otherId = await insertUsers(db, "vis-other", "Vis Other",);
      await db.insertInto("actors",).values({ id: otherId, display_name: "Vis Other", },).execute();
      const id = await seedAsset(ownerId, AssetVisibility.Shared,);
      await insertAssetShares(db, id, viewerId, ownerId,);
      await insertAssetLinks(db, id, AssetLinkEntity.Item, "linked-item",);

      const forViewer = await db
        .selectFrom("assets",)
        .innerJoin("asset_links", "assets.id", "asset_links.asset_id",)
        .select("assets.id as id",)
        .where((eb,) => visibleAssetFilter(eb, viewerId, "assets.",))
        .execute();

      expect(forViewer.map((r,) => r.id),).toEqual([id,],);

      const forOther = await db
        .selectFrom("assets",)
        .innerJoin("asset_links", "assets.id", "asset_links.asset_id",)
        .select("assets.id as id",)
        .where((eb,) => visibleAssetFilter(eb, otherId, "assets.",))
        .execute();

      expect(forOther,).toEqual([],);
    } finally {
      await teardown();
    }
  });

  test("shared-with-me is visible to the grantee in unjoined queries", async () => {
    await freshDb();
    try {
      const { ownerId, viewerId, } = await seedUsers();
      const otherId = await insertUsers(db, "vis-other", "Vis Other",);
      await db.insertInto("actors",).values({ id: otherId, display_name: "Vis Other", },).execute();
      const id = await seedAsset(ownerId, AssetVisibility.Shared,);
      await insertAssetShares(db, id, viewerId, ownerId,);

      await expect(visibleIds(viewerId,),).resolves.toEqual([id,],);
      await expect(visibleIds(otherId,),).resolves.toEqual([],);
      await expect(visibleIds(null,),).resolves.toEqual([],);

      // Production paths agree: direct access and the main listing admit the grantee.
      await expect(canAccessAsset(db, id, viewerId, null,),).resolves.toBe(true,);
      const listed = await listAssets(db, { actorId: viewerId, },);
      expect(listed.data.map((a,) => a.id),).toContain(id,);
    } finally {
      await teardown();
    }
  });
});

describe("visibleGalleryAssetFilter", () => {
  test("private asset linked to a public character is gallery-visible to strangers", async () => {
    await freshDb();
    try {
      const { ownerId, viewerId, } = await seedUsers();
      const id = await seedAsset(ownerId, AssetVisibility.Private,);
      const characterId = await insertActors(db, "Public Hero", {
        actor_type: ActorType.Character,
        owner_id: ownerId,
        visibility: ActorVisibility.Public,
      },);

      await insertAssetLinks(db, id, AssetLinkEntity.Actor, characterId,);

      const rows = await db
        .selectFrom("assets",)
        .select("id",)
        .where((eb,) => visibleGalleryAssetFilter(eb, viewerId,))
        .execute();

      expect(rows.map((r,) => r.id),).toEqual([id,],);

      // The base filter still hides it — the gallery link is what admits it.
      await expect(visibleIds(viewerId,),).resolves.toEqual([],);
    } finally {
      await teardown();
    }
  });

  test("private-character link does not admit the asset", async () => {
    await freshDb();
    try {
      const { ownerId, viewerId, } = await seedUsers();
      const id = await seedAsset(ownerId, AssetVisibility.Private,);
      const characterId = await insertActors(db, "Secret Hero", {
        actor_type: ActorType.Character,
        owner_id: ownerId,
        visibility: ActorVisibility.Private,
      },);

      await insertAssetLinks(db, id, AssetLinkEntity.Actor, characterId,);

      const rows = await db
        .selectFrom("assets",)
        .select("id",)
        .where((eb,) => visibleGalleryAssetFilter(eb, viewerId,))
        .execute();

      expect(rows,).toEqual([],);
    } finally {
      await teardown();
    }
  });
});
