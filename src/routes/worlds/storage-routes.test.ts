// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/routes/worlds/storage-routes.test.ts — the acting actor comes from AUTH.
 *
 * These mount the real Elysia routes with a real session `userId` derived,
 * exactly as the app does, so `requireActingActor` runs for real. The world is
 * PUBLIC and the stranger is a genuine member, which is the point: membership
 * must not be mistaken for identity.
 *
 * The attack each case reproduces: authenticated as the stranger, POST a body
 * naming the OWNER's actor id. Before the fix `checkStorageAccess` compared that
 * body value against `ownerActorId` and returned `allowed: true` — full
 * privilege escalation into someone else's private chest.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { ItemCategory, } from "../../db/enums";
import { WorldVisibility, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { createStorage, } from "../../worlds/storage";
import { storageRoutes, } from "./storage-routes";

const WORLD = "w1";
const LOCATION = "loc1";
const OWNER_USER = "user-owner";
const STRANGER_USER = "user-stranger";
const OWNER_ACTOR = "actor-owner";
const STRANGER_ACTOR = "actor-stranger";
const OTHER_WORLD = "w2";
const OTHER_LOCATION = "loc2";
let db: Kysely<DB>;
let itemId = "";
let storageId = "";

/** Mount the real routes behind a session identity, as the app wires them. */
function appFor(userId: string,): Elysia {
  return new Elysia()
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(storageRoutes({ database: db, config: {} as Config, },),) as unknown as Elysia;
}

/** A JSON POST to a storage path, authenticated as `userId`. */
function post(userId: string, path: string, body: Record<string, unknown>,): Promise<Response> {
  return appFor(userId,).handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** A GET of a storage path, authenticated as `userId`. */
function get(userId: string, path: string,): Promise<Response> {
  return appFor(userId,).handle(new Request(`http://localhost${path}`,),);
}

/** How many units of `itemId` the container holds. */
async function held(): Promise<number> {
  const rows = await db
    .selectFrom("location_storage_items",)
    .select(["quantity",],)
    .where("storage_id", "=", storageId,)
    .execute();

  return rows.reduce((total, row,) => total + row.quantity, 0,);
}

beforeEach(async () => {
  ({ db, } = await createTestDb());

  await insertUsers(db, "owner", "Owner", { id: OWNER_USER, },);
  await insertUsers(db, "stranger", "Stranger", { id: STRANGER_USER, },);
  // PUBLIC, so the stranger passes world access and the test measures the
  // STORAGE check. A private world would 404 at the world gate first and the
  // storage decision would never be exercised.
  await insertWorlds(db, OWNER_USER, "Public World", { id: WORLD, visibility: WorldVisibility.Public, },);
  await insertLocations(db, WORLD, "Camp", { id: LOCATION, },);
  // Each user has their own PLAYER actor: user_id set, owner_id NULL, which is
  // exactly the row `resolvePrimaryActorId` looks for.
  await insertActors(db, "Owner", { id: OWNER_ACTOR, user_id: OWNER_USER, },);
  await insertActors(db, "Stranger", { id: STRANGER_ACTOR, user_id: STRANGER_USER, },);
  itemId = await insertItems(db, WORLD, "Arrows", ItemCategory.Consumable,);

  storageId = (
    await createStorage(db, {
      worldId: WORLD,
      locationId: LOCATION,
      name: "Owner Chest",
      capacity: 100,
      security: 0,
      accessControl: { ownerActorId: OWNER_ACTOR, },
    },)
  ).id;
},);

afterEach(async () => {
  await db.destroy();
},);

describe("actor identity is derived from the session, not the body", () => {
  test("a WITHDRAW naming the owner in the body is refused for the stranger", async () => {
    await post(OWNER_USER, `/api/worlds/${WORLD}/storage/${storageId}/deposit`, { itemId, quantity: 10, },);

    // Authenticated as STRANGER, body claims to be the OWNER.
    const res = await post(STRANGER_USER, `/api/worlds/${WORLD}/storage/${storageId}/withdraw`, {
      itemId,
      quantity: 10,
      actorId: OWNER_ACTOR,
    },);

    expect(res.status,).toBe(403,);
    // Nothing left the owner's chest.
    expect(await held(),).toBe(10,);
  });

  test("a DEPOSIT naming the owner in the body is refused for the stranger", async () => {
    const res = await post(STRANGER_USER, `/api/worlds/${WORLD}/storage/${storageId}/deposit`, {
      itemId,
      quantity: 5,
      actorId: OWNER_ACTOR,
    },);

    expect(res.status,).toBe(403,);
    expect(await held(),).toBe(0,);
  });

  test("the owner succeeds with the SAME body that is refused for the stranger", async () => {
    // Same body, different session. This is what proves the decision follows
    // the AUTH and not the payload: nothing in the request differs but the user.
    const res = await post(OWNER_USER, `/api/worlds/${WORLD}/storage/${storageId}/deposit`, {
      itemId,
      quantity: 5,
      actorId: OWNER_ACTOR,
    },);

    expect(res.status,).toBe(200,);
    expect(await held(),).toBe(5,);
  });

  test("a stray user with no persona cannot act as anyone", async () => {
    await insertUsers(db, "nobody", "Nobody", { id: "user-nobody", },);

    const res = await post("user-nobody", `/api/worlds/${WORLD}/storage/${storageId}/deposit`, {
      itemId,
      quantity: 5,
      actorId: OWNER_ACTOR,
    },);

    expect(res.status,).toBe(404,);
    expect(await held(),).toBe(0,);
  });
});

describe("the contents route is access-checked", () => {
  test("a member cannot read another actor's private chest", async () => {
    await post(OWNER_USER, `/api/worlds/${WORLD}/storage/${storageId}/deposit`, { itemId, quantity: 7, },);

    // Before the fix this returned 200 with the owner's inventory.
    const res = await get(STRANGER_USER, `/api/worlds/${WORLD}/storage/${storageId}/contents`,);

    expect(res.status,).toBe(403,);
  });

  test("the owner still reads their own contents", async () => {
    await post(OWNER_USER, `/api/worlds/${WORLD}/storage/${storageId}/deposit`, { itemId, quantity: 7, },);

    const res = await get(OWNER_USER, `/api/worlds/${WORLD}/storage/${storageId}/contents`,);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { quantity: number }[] };
    expect(body.data[0]!.quantity,).toBe(7,);
  });

  test("the usage route scopes the container to the path world", async () => {
    // OWNER_USER must PASS the world gate on w2, or the request 404s before the
    // storage scope check runs and the test would pass for the wrong reason. So
    // w2 is PUBLIC (membership by access) and its chest belongs to STRANGER_USER.
    await insertWorlds(db, STRANGER_USER, "Second World", { id: "w2", visibility: WorldVisibility.Public, },);
    await insertLocations(db, "w2", "Camp", { id: "loc2", },);
    await createStorage(db, {
      worldId: "w2",
      locationId: "loc2",
      name: "Stranger Chest",
      capacity: 100,
      security: 0,
      accessControl: { ownerActorId: STRANGER_ACTOR, },
    },);

    // OWNER_USER is a member of w2 but the chest is in w1 — the world-scoped
    // lookup must not find it in w2.
    const foreign = await get(OWNER_USER, `/api/worlds/w2/storage/${storageId}`,);
    expect(foreign.status,).toBe(404,);

    // Control: w1's own usage still reads.
    const own = await get(OWNER_USER, `/api/worlds/${WORLD}/storage/${storageId}`,);
    expect(own.status,).toBe(200,);
  });
});

describe("the usage route is world-scoped", () => {
  // BUG-storage-usage-not-world-scoped — `GET /storage/:storageId` dropped
  // `:worldId` and the engine load carried no `world_id` predicate, so a
  // member of world A who learned a container id in world B was told B's
  // used/capacity/free instead of getting a 404. The engine now scopes the
  // load on (id, world_id), mirroring `loadNode`.
  test("a container from another world is a 404, not that world's usage", async () => {
    await insertWorlds(db, OWNER_USER, "Rival World", { id: OTHER_WORLD, },);
    await insertLocations(db, OTHER_WORLD, "Rival Camp", { id: OTHER_LOCATION, },);
    const foreign = (
      await createStorage(db, {
        worldId: OTHER_WORLD,
        locationId: OTHER_LOCATION,
        name: "Rival Chest",
        capacity: 42,
      },)
    ).id;

    const res = await get(OWNER_USER, `/api/worlds/${WORLD}/storage/${foreign}`,);

    expect(res.status,).toBe(404,);
  });

  test("the same container read from its OWN world still answers", async () => {
    await insertWorlds(db, OWNER_USER, "Rival World", { id: OTHER_WORLD, },);
    await insertLocations(db, OTHER_WORLD, "Rival Camp", { id: OTHER_LOCATION, },);
    const own = (
      await createStorage(db, {
        worldId: OTHER_WORLD,
        locationId: OTHER_LOCATION,
        name: "Rival Chest",
        capacity: 42,
      },)
    ).id;

    const res = await get(OWNER_USER, `/api/worlds/${OTHER_WORLD}/storage/${own}`,);

    expect(res.status,).toBe(200,);
    expect(await res.json() as { data: { capacity: number } },).toMatchObject({ data: { capacity: 42, }, },);
  });
});
