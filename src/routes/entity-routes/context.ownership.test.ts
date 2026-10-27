// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * SW-1 regression — `checkOwnership` compared `owner[ownershipFkColumn] === userId`
 * against a NULLABLE ownership column (`actors.user_id`), so an
 * UNAUTHENTICATED caller (userId === null) was GRANTED access to a row whose
 * ownership column is NULL (null === null), while the legitimate owner
 * (identified by `actors.owner_id`) was DENIED.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { actorItemsRoutes, } from "../actor-items";
import { checkOwnership, } from "./context";

let db: Kysely<DB>;
let npcActor: string; // actors.user_id IS NULL, actors.owner_id IS NULL
let ownedNpcActor: string; // actors.user_id IS NULL, actors.owner_id = ownerId
let ownerId: string;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  ownerId = uid();
  await insertUsers(db, `u-${ownerId}`, "Owner", {
    id: ownerId as never,
    role: "solo" as never,
    status: "active" as never,
    settings: "{}" as never,
  },);

  // A character with NO user_id and NO owner_id (the schema allows both NULL).
  npcActor = uid();
  await insertActors(db, "Unowned NPC", { id: npcActor as never, },);

  // A character owned by `ownerId` via owner_id, but with user_id NULL.
  ownedNpcActor = uid();
  await insertActors(db, "Owned NPC", {
    id: ownedNpcActor as never,
    owner_id: ownerId,
  },);

  await insertActorItems(db, npcActor, "Secret Sword", "weapon" as never, {
    id: "item-npc-1" as never,
  },);

  await insertActorItems(db, ownedNpcActor, "Secret Cloak", "armor" as never, {
    id: "item-owned-1" as never,
  },);
},);

afterAll(async () => {
  await db.destroy();
},);

const CONFIG = {
  parentPrefix: "actors",
  parentParam: "actorId",
  entityPath: "items",
  entityName: "Item",
  tableName: "actor_items",
  parentFk: "actor_id",
  ownershipTable: "actors",
  ownershipFkColumn: "user_id",
  orderBy: [{ column: "sort_order", dir: "asc" as const, },],
  fieldMappings: {},
} as unknown as Config;

function app(userId: string | null, userRole: string | null = null,): Elysia {
  return new Elysia({ name: `sw1-${userId ?? "anon"}`, },)
    .derive(() => ({ userId, userRole, }))
    .use(actorItemsRoutes({ database: db, config: CONFIG, },),) as unknown as Elysia;
}

describe("SW-1 — nullable ownership column must not authenticate an anonymous caller", () => {
  test("anonymous caller must NOT list an actor whose ownership column is NULL", async () => {
    const res = await app(null,).handle(
      new Request(`http://localhost/api/actors/${npcActor}/items`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("anonymous caller must NOT create a row under an actor whose ownership column is NULL", async () => {
    const res = await app(null,).handle(
      new Request(`http://localhost/api/actors/${npcActor}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Injected", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("the legitimate owner (actors.owner_id) must NOT be denied", async () => {
    const res = await app(ownerId, "user",).handle(
      new Request(`http://localhost/api/actors/${ownedNpcActor}/items`,),
    );

    expect(res.status,).toBe(200,);
  });

  test("checkOwnership() itself: anonymous caller must not match a NULL ownership column", async () => {
    const granted = await checkOwnership(
      db,
      CONFIG as never,
      npcActor,
      null,
      null,
    );

    expect(granted,).toBe(false,);
  });
});
