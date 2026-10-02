// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wardrobe binding route behavior tests. The bindings routes are the only
 * place where an inventory instance becomes part of an outfit, so what is
 * pinned here is the seam between route authz and service refusal:
 *
 *  - the actor-ownership gate short-circuits BEFORE the service runs, so a
 *    cross-user caller never learns whether the outfit or instance exists;
 *  - service-level refusals (instance not in this actor's inventory) surface
 *    as 404, not 500 — the route must not leak an unhandled throw;
 *  - DELETE is idempotent: removing an already-removed binding is 404.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { ItemCategory, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertUsers,
  insertWardrobeItems,
} from "../test-utils/insert-helpers";
import { wardrobeBindingRoutes, } from "./wardrobe-bindings";

const OWNER = "00000000-0000-4000-8000-000000000061";
const OWNER_USER = "00000000-0000-4000-8000-000000000071";
const OTHER_USER = "00000000-0000-4000-8000-000000000072";
const OTHER_ACTOR = "00000000-0000-4000-8000-000000000062";
const OUTFIT = "00000000-0000-4000-8000-000000000081";

const MSG_INSTANCE_MISSING = "Item instance not found";
const MSG_BINDING_MISSING = "Binding not found";
const MSG_OUTFIT_MISSING = "Wardrobe item not found";

/**
 * @param db
 * @param userId
 * @returns an app exposing only the wardrobe binding routes as this user
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  return new Elysia({ name: "test-wardrobe-bindings", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(wardrobeBindingRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param path
 * @param method
 * @param body
 * @returns a JSON Request for the binding routes
 */
function req(path: string, method: string, body?: unknown,): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", },
    ...(body === undefined ? {} : { body: JSON.stringify(body,), }),
  },);
}

/**
 * @param res
 * @returns the human-readable message from the shared error envelope
 */
async function messageOf(res: Response,): Promise<string> {
  return (await res.json() as { error: string }).error;
}

describe("Wardrobe binding routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let instanceId: string;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "bind-owner", "Bind Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "bind-other", "Bind Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Bind Route Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);
    await insertActors(db, "Unrelated Actor", {
      id: OTHER_ACTOR as never,
      owner_id: OTHER_USER,
      user_id: OTHER_USER,
    },);
    await insertWardrobeItems(db, "Route Outfit", { id: OUTFIT, actor_id: OWNER, },);
    instanceId = await insertActorItems(db, OWNER, "Route Sword", ItemCategory.Weapon,);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("list returns an empty array for an outfit with no bindings", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "GET",),
    );
    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("bind creates the row and list then reports it in camelCase", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", { item_instance_id: instanceId, },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = await res.json() as { id: string };
    expect(typeof id,).toBe("string",);

    const listRes = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "GET",),
    );
    const bindings = await listRes.json() as Array<Record<string, unknown>>;
    expect(bindings,).toHaveLength(1,);
    expect(bindings[0],).toEqual({
      id,
      actorId: OWNER,
      wardrobeItemId: OUTFIT,
      itemInstanceId: instanceId,
      createdAt: expect.any(String,),
    },);
  });

  test("bind is idempotent — a repeat POST returns 201 with the same id", async () => {
    const first = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", { item_instance_id: instanceId, },),
    );
    const second = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", { item_instance_id: instanceId, },),
    );
    expect(second.status,).toBe(201,);
    const a = await first.json() as { id: string };
    const b = await second.json() as { id: string };
    expect(b.id,).toBe(a.id,);

    const rows = await db
      .selectFrom("actor_wardrobe",)
      .selectAll()
      .where("wardrobe_item_id", "=", OUTFIT,)
      .execute();
    expect(rows,).toHaveLength(1,);
  });

  test("bind of an instance the actor does not own surfaces 404, not 500", async () => {
    const foreign = await insertActorItems(db, OTHER_ACTOR, "Not Mine", ItemCategory.Weapon,);
    const res = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", { item_instance_id: foreign, },),
    );
    expect(res.status,).toBe(404,);
    expect(await messageOf(res,),).toContain(MSG_INSTANCE_MISSING,);
  });

  test("delete removes the binding and reports ok", async () => {
    const bindRes = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", { item_instance_id: instanceId, },),
    );
    const { id, } = await bindRes.json() as { id: string };

    const delRes = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings/${id}`, "DELETE",),
    );
    expect(delRes.status,).toBe(200,);
    const body = await delRes.json() as { ok: boolean };
    expect(body.ok,).toBe(true,);

    const rows = await db.selectFrom("actor_wardrobe",).selectAll().where("id", "=", id,).execute();
    expect(rows,).toHaveLength(0,);
  });

  test("delete of an already-removed binding is 404", async () => {
    const bindRes = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", { item_instance_id: instanceId, },),
    );
    const { id, } = await bindRes.json() as { id: string };
    await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings/${id}`, "DELETE",),
    );
    const again = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings/${id}`, "DELETE",),
    );
    expect(again.status,).toBe(404,);
    expect(await messageOf(again,),).toBe(MSG_BINDING_MISSING,);
  });

  test("cross-user delete is refused and the binding survives", async () => {
    const bindRes = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", { item_instance_id: instanceId, },),
    );
    const { id, } = await bindRes.json() as { id: string };

    const res = await makeApp(db, OTHER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings/${id}`, "DELETE",),
    );
    expect(res.status,).toBe(404,);

    const rows = await db.selectFrom("actor_wardrobe",).selectAll().where("id", "=", id,).execute();
    expect(rows,).toHaveLength(1,);
  });

  test("every binding route requires auth (401)", async () => {
    const paths: Array<[string, string,]> = [
      [`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "GET",],
      [`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST",],
      [`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings/some-id`, "DELETE",],
    ];
    for (const [path, method,] of paths) {
      const res = await makeApp(db,).handle(req(path, method, { item_instance_id: instanceId, },),);
      expect(res.status,).toBe(401,);
    }
  });

  test("cross-user list and bind are blocked (404)", async () => {
    const list = await makeApp(db, OTHER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "GET",),
    );
    expect(list.status,).toBe(404,);

    const post = await makeApp(db, OTHER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", { item_instance_id: instanceId, },),
    );
    expect(post.status,).toBe(404,);
  });

  test("binding against an outfit the caller cannot see is 404", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/no-such-outfit/bindings`, "GET",),
    );
    expect(res.status,).toBe(404,);
    expect(await messageOf(res,),).toBe(MSG_OUTFIT_MISSING,);
  });

  test("bind rejects a missing item_instance_id with a 4xx", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      req(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/bindings`, "POST", {},),
    );
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    expect(res.status,).toBeLessThan(500,);
  });
});
