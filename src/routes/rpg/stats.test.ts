// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Stats Route Tests
 *
 * Tests GET/PATCH/POST /api/rpg/stats/:actorId with auth + ownership.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { rpgRoutes, } from "./index";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-rpg-stats", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(rpgRoutes({ database: db, config: {} as never, },),);
}

const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ACTOR = "00000000-0000-4000-8000-000000000002";

describe("RPG stats routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "user-1" as never, },);
    await insertUsers(db, "other", "Other", { id: "user-2" as never, },);
    await insertActors(db, "Hero", { id: ACTOR_ID as never, owner_id: "user-1", },);
    await insertActors(db, "Villain", { id: OTHER_ACTOR as never, owner_id: "user-2", },);
  },);

  afterAll(() => sqlite.close());

  test("GET requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/rpg/stats/${ACTOR_ID}`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("GET returns 404 when no stats exist", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/stats/${ACTOR_ID}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "user-2", "user",).handle(
      new Request(`http://localhost/api/rpg/stats/${ACTOR_ID}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST creates stats and returns 201", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/stats/${ACTOR_ID}`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          hp: 20,
          maxHp: 20,
          ac: 15,
          stats: { str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 8, },
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = await res.json() as { id: string; actorId: string };
    expect(body.id,).toBeDefined();
    expect(body.actorId,).toBe(ACTOR_ID,);
  });

  test("GET returns stats after creation", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/stats/${ACTOR_ID}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { hp: number; maxHp: number; str: number };
    expect(body.hp,).toBe(20,);
    expect(body.maxHp,).toBe(20,);
    expect(body.str,).toBe(16,);
  });

  test("POST returns 409 on duplicate", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/stats/${ACTOR_ID}`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ hp: 10, maxHp: 10, ac: 10, },),
      },),
    );
    expect(res.status,).toBe(409,);
  });

  test("PATCH updates stats", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      new Request(`http://localhost/api/rpg/stats/${ACTOR_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ hp: 15, str: 18, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { hp: number; str: number; maxHp: number };
    expect(body.hp,).toBe(15,);
    expect(body.str,).toBe(18,);
    expect(body.maxHp,).toBe(20,); // unchanged
  });

  test("PATCH returns 404 for missing stats", async () => {
    const res = await makeApp(db, "user-2", "user",).handle(
      new Request(`http://localhost/api/rpg/stats/${OTHER_ACTOR}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ hp: 5, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("admin can access any actor's stats", async () => {
    const res = await makeApp(db, "admin-user", "admin",).handle(
      new Request(`http://localhost/api/rpg/stats/${ACTOR_ID}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { hp: number };
    expect(body.hp,).toBe(15,); // updated from PATCH test
  });
});
