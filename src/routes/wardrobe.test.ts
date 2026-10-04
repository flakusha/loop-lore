// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wardrobe route behavior tests: auth (401), ownership (404 for
 * cross-user), validation, and the outfit-scoped generation gates.
 *
 * Generation itself is service-level (provider-driven); routes are
 * pinned here for access control and payload validation only.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { OutfitChangeGate, } from "../characters/services/wardrobe/change-gate";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { wardrobeRoutes, } from "./wardrobe";
import { wardrobeAvatarRoutes, } from "./wardrobe-avatars";
import { outfitOverrideRoutes, } from "./wardrobe-overrides";

const OWNER = "00000000-0000-4000-8000-000000000021";
const OWNER_USER = "00000000-0000-4000-8000-000000000031";
const OTHER_USER = "00000000-0000-4000-8000-000000000032";
const CHAT = "00000000-0000-4000-8000-000000000041";

/**
 * @param db
 * @param userId
 * @param userRole
 * @param outfitChangeGate
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string, outfitChangeGate?: OutfitChangeGate,) {
  return new Elysia({ name: "test-wardrobe", },)
    .derive(() => ({ userId, userRole, }))
    .use(wardrobeRoutes({ database: db, },),)
    .use(wardrobeAvatarRoutes({ database: db, },),)
    .use(outfitOverrideRoutes({ database: db, outfitChangeGate, },),) as unknown as Elysia;
}

describe("Wardrobe routes — auth & ownership", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let itemId: string;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Wardrobe Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);

    await db.insertInto("chats",).values({
      id: CHAT,
      name: "Wardrobe Chat",
      created_by: OWNER_USER,
    },).execute();

    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Armor", descriptor: "plate armor", },),
      },),
    );

    expect(res.status,).toBe(201,);
    itemId = (await res.json() as { id: string }).id;
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("list requires auth (401)", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("list hides the actor from another user (404)", async () => {
    const res = await makeApp(db, OTHER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("owner lists their wardrobe with the created item", async () => {
    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe`,),
    );

    expect(res.status,).toBe(200,);
    const items = await res.json() as Array<{ id: string; name: string }>;
    expect(items.some((i,) => i.id === itemId),).toBe(true,);
  });

  test("cross-user update is blocked (404)", async () => {
    const res = await makeApp(db, OTHER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Hacked", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("cross-user delete is blocked (404)", async () => {
    const res = await makeApp(db, OTHER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe/${itemId}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("cross-user binding is blocked (404)", async () => {
    const res = await makeApp(db, OTHER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe/${itemId}/bindings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ item_instance_id: "instance-1", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("create rejects an empty name (validation)", async () => {
    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "", },),
      },),
    );

    expect(res.status,).toBeGreaterThanOrEqual(400,);
    expect(res.status,).toBeLessThan(500,);
  });

  test("outfit-resolve requires auth (401)", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${OWNER}/outfit-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ emotion: "joy", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("outfit-resolve is blocked for another user (404)", async () => {
    const res = await makeApp(db, OTHER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/outfit-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ emotion: "joy", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("generation rejects an unknown emotion (400)", async () => {
    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe/${itemId}/emotion-avatars/single`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ base_avatar_id: "some-avatar", emotion: "not-a-real-emotion", },),
      },),
    );

    expect(res.status,).toBe(400,);
  });

  test("generation is blocked for another user (404)", async () => {
    const res = await makeApp(db, OTHER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe/${itemId}/emotion-avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ base_avatar_id: "some-avatar", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("generation on an invisible outfit is blocked (404)", async () => {
    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe/nonexistent-item/emotion-avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ base_avatar_id: "some-avatar", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });
});

describe("Wardrobe world template scope", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  const FOREIGN_WORLD = "00000000-0000-4000-8000-000000000051";
  const OWNED_WORLD = "00000000-0000-4000-8000-000000000052";

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "World Scope Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);

    await insertWorlds(db, OTHER_USER, "Foreign World", { id: FOREIGN_WORLD as never, },);
    await insertWorlds(db, OWNER_USER, "Own World", { id: OWNED_WORLD as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("create into a world you do not own is forbidden (403)", async () => {
    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Intruder Garb", world_id: FOREIGN_WORLD, },),
      },),
    );

    expect(res.status,).toBe(403,);
  });

  test("listing templates of a world you do not own is forbidden (403)", async () => {
    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe?worldId=${FOREIGN_WORLD}`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("world owner creates and lists templates (201 then 200)", async () => {
    const create = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Own Guard Uniform", world_id: OWNED_WORLD, },),
      },),
    );

    expect(create.status,).toBe(201,);
    const { id, } = await create.json() as { id: string };

    const list = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe?worldId=${OWNED_WORLD}`,),
    );

    expect(list.status,).toBe(200,);
    const items = await list.json() as Array<{ id: string }>;
    expect(items.some((i,) => i.id === id),).toBe(true,);
  });
});

describe("Wardrobe chat override routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let itemId: string;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Override Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
      actor_type: "character",
    },);

    await db.insertInto("chats",).values({
      id: CHAT,
      name: "Override Chat",
      created_by: OWNER_USER,
    },).execute();

    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Robes", },),
      },),
    );

    itemId = (await res.json() as { id: string }).id;
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("non-participant cannot set the chat override (404)", async () => {
    const res = await makeApp(db, OTHER_USER, "user",).handle(
      new Request(`http://localhost/api/chats/${CHAT}/wardrobe-override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actor_id: OWNER, outfit_id: itemId, },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("participant sets and reads back the chat override", async () => {
    const set = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/chats/${CHAT}/wardrobe-override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actor_id: OWNER, outfit_id: itemId, },),
      },),
    );

    expect(set.status,).toBe(200,);

    const read = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/chats/${CHAT}/wardrobe-override/${OWNER}`,),
    );

    expect(read.status,).toBe(200,);
    expect((await read.json() as { outfit_id: string }).outfit_id,).toBe(itemId,);
  });

  test("clearing with null removes the override", async () => {
    const clear = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/chats/${CHAT}/wardrobe-override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actor_id: OWNER, outfit_id: null, },),
      },),
    );

    expect(clear.status,).toBe(200,);

    const read = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/chats/${CHAT}/wardrobe-override/${OWNER}`,),
    );

    expect((await read.json() as { outfit_id: string | null }).outfit_id,).toBeNull();
  });

  test("player-actor change is refused when the immersion gate denies (403)", async () => {
    const playerActor = "00000000-0000-4000-8000-000000000023";
    await insertActors(db, "Player Avatar", {
      id: playerActor as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
      actor_type: "user",
    },);

    const res = await makeApp(db, OWNER_USER, "user", {
      review: () => ({ allowed: false, reason: "bound hands", }),
    },).handle(
      new Request(`http://localhost/api/chats/${CHAT}/wardrobe-override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actor_id: playerActor, outfit_id: itemId, },),
      },),
    );

    expect(res.status,).toBe(403,);
    expect(await res.text(),).toContain("bound hands",);
  });

  test("NPC-actor change bypasses a refusing gate (200)", async () => {
    const res = await makeApp(db, OWNER_USER, "user", {
      review: () => ({ allowed: false, reason: "never reached", }),
    },).handle(
      new Request(`http://localhost/api/chats/${CHAT}/wardrobe-override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actor_id: OWNER, outfit_id: itemId, },),
      },),
    );

    expect(res.status,).toBe(200,);
  });

  test("setting an invisible outfit fails (404)", async () => {
    const res = await makeApp(db, OWNER_USER, "user",).handle(
      new Request(`http://localhost/api/chats/${CHAT}/wardrobe-override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actor_id: OWNER, outfit_id: "missing-outfit", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });
});
