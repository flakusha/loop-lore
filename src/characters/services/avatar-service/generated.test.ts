// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for avatar-service/generated.ts — the Avatar Dogfood binding op
 * (TASK-avatar-dogfood-assistant-generation, slice 1).
 *
 * Real DB (createTestDb + insert-helpers), no mocks: bind success shape,
 * empty-input refusal, and the rollback contract (a mid-run failure leaves
 * no avatar rows and no `avatar`-labeled actor links behind).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertAssets, insertUsers, } from "../../../test-utils/insert-helpers";
import { bindGeneratedActorAvatar, } from "./generated";

let handle: TestDb;
let db: Kysely<DB>;
let ownerId: string;
let actorId: string;
let assetA: string;
let assetB: string;

beforeAll(async () => {
  handle = await createTestDb();
  db = handle.db;
  ownerId = await insertUsers(db, "dogfood-owner", "Dogfood Owner",);
  actorId = await insertActors(db, "Elara Nightwhisper", { owner_id: ownerId, },);
  assetA = await insertAssets(db, ownerId, "gen-a.png", "image/png", AssetType.Image, 4, "/tmp/gen-a.png",);
  assetB = await insertAssets(db, ownerId, "gen-b.png", "image/png", AssetType.Image, 4, "/tmp/gen-b.png",);
},);

afterAll(async () => {
  await destroyTestDb(handle,);
},);

describe("bindGeneratedActorAvatar", () => {
  test("binds every asset as a non-primary `generated` variant in order", async () => {
    const avatarIds = await bindGeneratedActorAvatar(db, { actorId, assetIds: [assetA, assetB,], },);

    expect(avatarIds,).toHaveLength(2,);
    const rows = await db
      .selectFrom("character_avatars",)
      .select(["id", "asset_id", "label", "is_primary", "sort_order",],)
      .where("actor_id", "=", actorId,)
      .orderBy("sort_order", "asc",)
      .execute();

    expect(rows.map((r,) => r.asset_id),).toEqual([assetA, assetB,],);
    expect(rows.every((r,) => r.label === "generated" && r.is_primary === 0),).toBe(true,);
    expect(rows.map((r,) => r.sort_order),).toEqual([0, 1,],);
    // createAvatar attaches the actor gallery link per variant.
    const links = await db
      .selectFrom("asset_links",)
      .select("asset_id",)
      .where("entity_type", "=", "actor",)
      .where("entity_id", "=", actorId,)
      .where("label", "=", "avatar",)
      .execute();

    expect(links.map((l,) => l.asset_id).sort(),).toEqual([assetA, assetB,].sort(),);
  });

  test("refuses an empty asset list outright", async () => {
    await expect(
      bindGeneratedActorAvatar(db, { actorId, assetIds: [], },),
    ).rejects.toThrow(/no assets to bind/,);
  });

  test("rolls back every row when a later binding fails (FK on a bogus asset)", async () => {
    // assetA binds; the bogus id trips the character_avatars.asset_id FK.
    await expect(
      bindGeneratedActorAvatar(db, { actorId, assetIds: [assetA, "no-such-asset",], },),
    ).rejects.toThrow();

    // The success-test rows from the first case are still there, but THIS
    // call's rows (and their links) must be gone: count is unchanged at 2.
    const rows = await db
      .selectFrom("character_avatars",)
      .select("id",)
      .where("actor_id", "=", actorId,)
      .execute();

    expect(rows,).toHaveLength(2,);
  });
});
