// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-user ACL test for `POST /actors/:actorId/avatars`.
 *
 * `requireActorAccess` proves the caller owns the ACTOR, but `image_url` is
 * caller-supplied and flowed straight into `createAvatar` -> `linkAsset`,
 * inserting an `asset_links` row on an asset the caller had no claim to. So a
 * user who owned actor X could attach ANY user's private asset to X and get a
 * 201 back. Two defects fall out of that:
 *
 *  1. the cross-user link row (asserted below via the DB, not the status code);
 *  2. an unknown asset id reached the avatars FK and surfaced as a raw
 *     `FOREIGN KEY constraint failed` 500 - raw SQLite text on the wire, and a
 *     500-vs-201 difference is an existence oracle on arbitrary UUIDs.
 *
 * The PUT/DELETE `:avatarId` routes share the sibling gap but are fixed on a
 * separate branch (`fix-avatar-idor`); this file deliberately covers only POST.
 *
 * Resource contract (parallel-safe): owns ONE `:memory:` SQLite from
 * createTestDb, created in beforeAll and released in afterAll by a teardown
 * guarded against a failed beforeAll. Fixture ids are file-local constants
 * over a private DB, so they collide with nothing. No fixed file path, no
 * port, no process-global, no ordering dependence.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertAssets, insertUsers, } from "../test-utils/insert-helpers";
import { characterAvatarsRoutes, } from "./character-avatars";

const VICTIM_USER = "00000000-0000-4000-8000-000000000061";
const ATTACKER_USER = "00000000-0000-4000-8000-000000000062";
// The attacker owns this actor.
const ATTACKER_ACTOR = "00000000-0000-4000-8000-000000000071";
// Belongs to the victim - the asset the attacker must not be able to attach.
const VICTIM_ASSET = "00000000-0000-4000-8000-000000000081";
// Belongs to the attacker - the positive path.
const OWN_ASSET = "00000000-0000-4000-8000-000000000082";
const UNKNOWN_ASSET = "00000000-0000-4000-8000-0000000000ee";

describe("POST /actors/:actorId/avatars (asset owner gate)", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "victim2", "Victim2", { id: VICTIM_USER as never, },);
    await insertUsers(db, "attacker2", "Attacker2", { id: ATTACKER_USER as never, },);
    await insertActors(db, "Attacker Actor", {
      id: ATTACKER_ACTOR as never,
      owner_id: ATTACKER_USER,
      user_id: ATTACKER_USER,
    },);

    await insertAssets(db, VICTIM_USER, "victim.png", "image/png", "image", 1024, "/victim.png", {
      id: VICTIM_ASSET as never,
    },);

    await insertAssets(db, ATTACKER_USER, "own.png", "image/png", "image", 1024, "/own.png", {
      id: OWN_ASSET as never,
    },);
  },);

  afterAll(async () => {
    // Guarded: a failed beforeAll leaves `db` undefined, and an unguarded
    // destroy() throws a TypeError that bun reports as an EXTRA spurious
    // failure alongside the real setup error. Exit status is unchanged; this
    // removes the noise, it does not hide anything.
    if (!db) { return; }
    await db.destroy();
    sqlite.close();
  },);

  const createAs = (assetId: string, userId: string, userRole = "user",) =>
    new Elysia({ name: "create-acl", },)
      .derive(() => ({ userId, userRole, }))
      .use(characterAvatarsRoutes({ database: db, },),)
      .handle(
        new Request(`http://localhost/api/actors/${ATTACKER_ACTOR}/avatars`, {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ image_url: assetId, emotion: "happy", },),
        },),
      );

  const linkRows = (assetId: string,) =>
    db
      .selectFrom("asset_links",)
      .select(["asset_id", "entity_type", "entity_id",],)
      .where("asset_id", "=", assetId,)
      .where("entity_id", "=", ATTACKER_ACTOR,)
      .execute();

  test("an actor owner CANNOT create an avatar from another user's private asset", async () => {
    const res = await createAs(VICTIM_ASSET, ATTACKER_USER,);

    // Pre-fix: 201 Created, with a link row planted on the victim's asset
    // pointing at the attacker's actor.
    expect(res.status,).not.toBe(201,);
    expect(res.status,).toBe(404,);

    // Ownership is enforced server-side, not merely reported in the status:
    // the victim must be left with zero link rows for the attacker's actor.
    expect(await linkRows(VICTIM_ASSET,),).toHaveLength(0,);
  });

  test("an unknown asset id is not a 500 and leaks no raw SQLite FK error", async () => {
    const res = await createAs(UNKNOWN_ASSET, ATTACKER_USER,);
    const body = await res.text();

    // Pre-fix: 500 with body `\"FOREIGN KEY constraint failed\"` straight from
    // better-sqlite3, which is both a text leak and a 500-vs-201 oracle.
    expect(res.status,).not.toBe(500,);
    expect(res.status,).toBe(404,);
    expect(body,).not.toMatch(/FOREIGN KEY/i,);
    expect(body,).not.toMatch(/constraint/i,);
    expect(await linkRows(UNKNOWN_ASSET,),).toHaveLength(0,);

    // The oracle is not closed by the status alone: an unknown id and a
    // not-yours id must be byte-identical on the wire, or the message text
    // still lets a caller probe which asset ids exist.
    const victimRes = await createAs(VICTIM_ASSET, ATTACKER_USER,);
    expect(await victimRes.text(),).toBe(body,);
  });

  test("the owner can still create an avatar from their OWN asset", async () => {
    const res = await createAs(OWN_ASSET, ATTACKER_USER,);
    const body = await res.text();

    expect(res.status,).toBe(201,);
    const created = JSON.parse(body,) as { id: string };
    expect(created.id,).toBeTruthy();

    // And the link row really is written - the guard must not over-block.
    const rows = await linkRows(OWN_ASSET,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0],).toMatchObject({
      asset_id: OWN_ASSET,
      entity_id: ATTACKER_ACTOR,
      entity_type: "actor",
    },);
  });

  // Negative space: a malformed (non-UUID) id took the same FK path as the
  // unknown UUID, so pre-fix it leaked the identical raw SQLite 500. It must
  // land on the same uniform 404, proving the gate - not luck about id format -
  // is what closes the error path.
  test("a malformed asset id is a uniform 404, never a raw SQLite error", async () => {
    const res = await createAs("not-a-uuid", ATTACKER_USER,);
    const body = await res.text();

    expect(res.status,).toBe(404,);
    expect(body,).not.toMatch(/FOREIGN KEY/i,);

    const unknownRes = await createAs(UNKNOWN_ASSET, ATTACKER_USER,);
    expect(await unknownRes.text(),).toBe(body,);
  });

  // The presence check must still run first: a missing image_url is the
  // caller's own mistake (400), not an authorization failure (404).
  test("a missing image_url is still 400, not 404", async () => {
    const res = await new Elysia({ name: "create-acl-nourl", },)
      .derive(() => ({ userId: ATTACKER_USER, userRole: "user", }))
      .use(characterAvatarsRoutes({ database: db, },),)
      .handle(
        new Request(`http://localhost/api/actors/${ATTACKER_ACTOR}/avatars`, {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ emotion: "happy", },),
        },),
      );

    expect(res.status,).toBe(400,);
  });
});
