// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TASK-031 boundary guard on PUT /api/worlds/:worldId.
 *
 * A world update carrying character-owned fields must be rejected with 422
 * (naming the fields) without touching the row, while legitimate world
 * writes — including shared keys like `description` and `name` — keep
 * working. The guard sits behind the ownership check, so non-owner callers
 * still get their auth error.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { HandleOpts, } from "./types";
import { worldRoutes, } from "./worlds-routes";

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-world-boundary", },)
    .derive(() => ({ userId, userRole, }))
    .use(worldRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("PUT /api/worlds/:worldId — character/world boundary", () => {
  let db: Kysely<DB>;
  let sqlite: Awaited<ReturnType<typeof createTestDb>>["sqlite"];
  let ownerId: string;
  let worldId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    worldId = uid();
    await insertWorlds(db, ownerId, "Boundary Realm", { id: worldId, } as never,);
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  test("rejects character-owned fields with 422 naming them, without writing the row", async () => {
    const res = await appWithAuth(db, ownerId, "user",).handle(
      new Request(`${BASE}/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ personality: "brooding", displayName: "New Name", lore: "kept", },),
      },),
    );
    expect(res.status,).toBe(422,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain('"personality"',);
    expect(body.error,).toContain('"displayName"',);
    expect(body.error,).toContain("character-owned",);
    expect(body.error,).not.toContain('"lore"',);

    const row = await db
      .selectFrom("worlds",)
      .select(["name", "lore",],)
      .where("id", "=", worldId,)
      .executeTakeFirst();
    expect(row?.name,).toBe("Boundary Realm",);
    expect(row?.lore,).toBeNull();
  });

  test("legitimate world fields still update (no over-blocking)", async () => {
    const res = await appWithAuth(db, ownerId, "user",).handle(
      new Request(`${BASE}/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Renamed Realm", lore: "Ancient lore.", rpgDice: true, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("worlds",)
      .select(["name", "lore", "rpg_dice",],)
      .where("id", "=", worldId,)
      .executeTakeFirst();
    expect(row?.name,).toBe("Renamed Realm",);
    expect(row?.lore,).toBe("Ancient lore.",);
    expect(row?.rpg_dice,).toBe(1,);
  });

  test("shared keys `description` and `name` still update", async () => {
    const res = await appWithAuth(db, ownerId, "user",).handle(
      new Request(`${BASE}/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ description: "world blurb", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("worlds",)
      .select("description",)
      .where("id", "=", worldId,)
      .executeTakeFirst();
    expect(row?.description,).toBe("world blurb",);
  });

  test("non-owner still gets 403 (guard sits behind ownership check)", async () => {
    const strangerId = uid();
    await insertUsers(db, "stranger", "Stranger", { id: strangerId, } as never,);
    const res = await appWithAuth(db, strangerId, "user",).handle(
      new Request(`${BASE}/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ personality: "brooding", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });
});
