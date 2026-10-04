// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-user ACL test for `DELETE /actors/:actorId/assets/:assetId`.
 *
 * The handler proved the caller owns the ACTOR but never the ASSET, and
 * `unlinkAsset` deletes on `asset_id` alone. So a user who owned actor X could
 * drop the link row of ANY asset attached to actor X, including one owned by
 * somebody else. This is the destructive variant of the same defect, so the
 * test asserts the link row SURVIVES the rejected call, not just the status.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AssetLinkEntity, } from "../db/enums-content";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertAssetLinks, insertAssets, insertUsers, } from "../test-utils/insert-helpers";
import { characterAvatarsRoutes, } from "./character-avatars";

const VICTIM_USER = "00000000-0000-4000-8000-000000000031";
const ATTACKER_USER = "00000000-0000-4000-8000-000000000032";
// The attacker owns this actor. The victim's asset is linked to it.
const ATTACKER_ACTOR = "00000000-0000-4000-8000-000000000041";
const VICTIM_ASSET = "00000000-0000-4000-8000-000000000051";
const OWN_ASSET = "00000000-0000-4000-8000-000000000052";

describe("DELETE /actors/:actorId/assets/:assetId (asset owner gate)", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "victim", "Victim", { id: VICTIM_USER as never, },);
    await insertUsers(db, "attacker", "Attacker", { id: ATTACKER_USER as never, },);
    await insertActors(db, "Attacker Actor", {
      id: ATTACKER_ACTOR as never,
      owner_id: ATTACKER_USER,
      user_id: ATTACKER_USER,
    },);

    // Belongs to the victim, not the attacker.
    await insertAssets(db, VICTIM_USER, "victim.png", "image/png", "image", 1024, "/victim.png", {
      id: VICTIM_ASSET as never,
    },);
    // Belongs to the attacker — the positive path must still work.
    await insertAssets(db, ATTACKER_USER, "own.png", "image/png", "image", 1024, "/own.png", {
      id: OWN_ASSET as never,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  const unlinkAs = (assetId: string, userId: string | undefined, userRole: string,) =>
    new Elysia({ name: "unlink-acl", },)
      .derive(() => ({ userId, userRole, }))
      .use(characterAvatarsRoutes({ database: db, },),)
      .handle(
        new Request(`http://localhost/api/actors/${ATTACKER_ACTOR}/assets/${assetId}`, { method: "DELETE", },),
      );

  const unlink = (assetId: string, userId?: string,) => unlinkAs(assetId, userId, "user",);

  const linkRows = (assetId: string,) =>
    db
      .selectFrom("asset_links",)
      .select(["entity_type", "entity_id",],)
      .where("asset_id", "=", assetId,)
      .where("entity_id", "=", ATTACKER_ACTOR,)
      .execute();

  test("404 when the attacker unlinks a victim's asset — the link row survives", async () => {
    await insertAssetLinks(db, VICTIM_ASSET, AssetLinkEntity.Actor, ATTACKER_ACTOR,);

    const res = await unlink(VICTIM_ASSET, ATTACKER_USER,);

    expect(res.status,).toBe(404,);
    // Ownership is enforced server-side, not just reported in the status.
    expect(await linkRows(VICTIM_ASSET,),).toHaveLength(1,);
  });

  test("204 when the attacker unlinks their OWN asset", async () => {
    await insertAssetLinks(db, OWN_ASSET, AssetLinkEntity.Actor, ATTACKER_ACTOR,);

    const res = await unlink(OWN_ASSET, ATTACKER_USER,);

    expect(res.status,).toBe(204,);
    expect(await linkRows(OWN_ASSET,),).toHaveLength(0,);
  });

  // requireActorAccess grants admin/solo/tester a bypass via can(role, "admin.character"),
  // but requireAssetOwner is strict owner-only — matching DELETE /assets/:id/links/:linkId,
  // which performs the identical unlink under the same strict guard. An admin can no
  // longer drop another user's asset_link. Pinned here so the change is explicit rather
  // than an unnoticed side effect of the ACL fix.
  test("admin is refused on another user's asset (strict owner gate)", async () => {
    const adminAsset = "00000000-0000-4000-8000-000000000054";
    await insertAssets(db, VICTIM_USER, "v3.png", "image/png", "image", 1024, "/v3.png", {
      id: adminAsset as never,
    },);
    await insertAssetLinks(db, adminAsset, AssetLinkEntity.Actor, ATTACKER_ACTOR,);

    const res = await unlinkAs(adminAsset, "admin", "admin",);

    expect(res.status,).toBe(404,);
    expect(await linkRows(adminAsset,),).toHaveLength(1,);
  });

  test("404 for an unknown asset id — never a silent 204", async () => {
    const res = await unlink("00000000-0000-4000-8000-0000000000ee", ATTACKER_USER,);

    // Pre-fix this returned 204: unlinkAsset deleted zero rows and reported success.
    expect(res.status,).toBe(404,);
  });

  test("404 when the asset owner does NOT own the actor — both gates must hold", async () => {
    // The victim owns this asset, but the actor belongs to the attacker.
    // Owning the asset is not enough: the actor check must still refuse.
    const victimAsset = "00000000-0000-4000-8000-000000000053";
    await insertAssets(db, VICTIM_USER, "v2.png", "image/png", "image", 1024, "/v2.png", {
      id: victimAsset as never,
    },);
    await insertAssetLinks(db, victimAsset, AssetLinkEntity.Actor, ATTACKER_ACTOR,);

    const res = await unlink(victimAsset, VICTIM_USER,);

    expect(res.status,).toBe(404,);
    expect(await linkRows(victimAsset,),).toHaveLength(1,);
  });
});
