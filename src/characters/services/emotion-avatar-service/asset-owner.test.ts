// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for the generated-asset owner resolution.
 *
 * Deliberately NOT gated on ISOLATED: the sibling `single-generation.test.ts`
 * needs `mock.module` (provider stub), which only behaves under `--isolate`,
 * so a bug in the owner id would hide behind a skipped file. This suite
 * touches only the db, so it must run in a bare `bun test` too.
 *
 * DEFECT: `assets.owner_id` references `users.id`, but the generation path
 * passed the ACTOR id as the owner — an FK violation when no user holds that
 * id, and a silent mis-attribution to an unrelated user when one does.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import { resolveAssetOwnerId, } from "./single-generation";

const OWNER_ID = "user-asset-owner";
/** Deliberately also present in `users`, so the FK accepts the wrong value. */
const COLLIDING_ID = "actor-id-collision";

describe("resolveAssetOwnerId", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "asset-owner", "Asset Owner", { id: OWNER_ID as never },);
    await insertUsers(db, "id-collision", "Id Collision", { id: COLLIDING_ID as never },);

    // Owned character (route-owned): owner_id is set, user_id is not.
    await insertActors(db, "Owned Character", { id: "actor-owned", owner_id: OWNER_ID },);
    // The requester's own persona: user_id is set, owner_id is not.
    await insertActors(db, "Persona", { id: "actor-persona", user_id: OWNER_ID },);
    // Both columns empty — no user can own an asset for it.
    await insertActors(db, "Orphan", { id: "actor-orphan" },);
    // owner_id is set, and the actor id collides with an unrelated user row.
    await insertActors(db, "Colliding", { id: COLLIDING_ID, owner_id: OWNER_ID },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  it("returns the owning user of an owned character, never the actor id", async () => {
    const ownerId = await resolveAssetOwnerId(db, "actor-owned",);
    expect(ownerId,).toBe(OWNER_ID,);
    expect(ownerId,).not.toBe("actor-owned",);
  },);

  it("returns the persona user when only user_id is set", async () => {
    expect(await resolveAssetOwnerId(db, "actor-persona",),).toBe(OWNER_ID,);
  },);

  it("prefers the owning user over an unrelated user whose id equals the actor id", async () => {
    expect(await resolveAssetOwnerId(db, COLLIDING_ID,),).toBe(OWNER_ID,);
  },);

  it("returns an id that satisfies the assets.owner_id foreign key", async () => {
    for (const actorId of ["actor-owned", "actor-persona", COLLIDING_ID,]) {
      const ownerId = await resolveAssetOwnerId(db, actorId,);
      const owner = await db.selectFrom("users",).select("id",).where("id", "=", ownerId,).executeTakeFirst();

      expect(owner?.id,).toBe(ownerId,);
    }
  },);

  it("throws rather than writing an unattributable asset row", async () => {
    await expect(resolveAssetOwnerId(db, "actor-orphan",),).rejects.toThrow("no owning user",);
    await expect(resolveAssetOwnerId(db, "actor-that-does-not-exist",),).rejects.toThrow("no owning user",);
  },);
},);
