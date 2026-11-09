// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Injection surface of the world routes.
 *
 * The Edit modal reads its world through GET /api/v1/worlds/:worldId, whose
 * path parameter is user-supplied and reaches the database as a query value.
 * These tests pin that the value is BOUND and never concatenated: a
 * SQL-shaped id must match no row, must not leak another world's data and
 * must not carry a second statement, and the list filter's LIKE pattern must
 * be bound the same way.
 *
 * Resource contract (parallel-safe):
 * - Each test owns a FRESH in-memory SQLite DB (`createTestDb` in
 *   beforeEach) - a `:memory:` handle is per-instance, never a shared file,
 *   so concurrent runners cannot collide.
 * - Teardown is deterministic: `destroyTestDb` runs in `afterEach`, which Bun
 *   executes even when an assertion throws, so a failed test cannot leak an
 *   open handle into the next one.
 * - No ordering dependence: every test seeds its own user and its own canary
 *   world in `beforeEach`, so no test sees rows another test created and each
 *   one passes on its own. The canary world is what makes the LIKE test
 *   meaningful - a concatenated pattern would return it.
 * - No process globals are set: this file never calls `setTestDatabase`,
 *   never registers a provider, opens a port or writes a file.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import {
  createTestDb,
  destroyTestDb,
  type TestDb,
} from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
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
  return new Elysia({ name: "test-worlds-injection", },)
    .derive(() => ({ userId, userRole, }))
    .use(worldRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("worldRoutes — injection surface", () => {
  let fixture: TestDb | undefined;
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    db = fixture.db;

    ownerId = uid();
    await insertUsers(db, "injection-owner", "Injection Owner", { id: ownerId, } as never,);
    await insertActors(db, ownerId, {
      id: ownerId,
      actor_type: "user",
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
    } as never,);

    // A world whose contents must never leak through a crafted id.
    const app = appWithAuth(db, ownerId, "user",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "Canary Realm",
          description: "canary description",
          lore: "canary lore",
        },),
      },),
    );

    expect(res.status,).toBe(201,);
    ({ id: worldId, } = (await res.json()) as { id: string });
  },);

  afterEach(async () => {
    if (fixture) {
      await destroyTestDb(fixture,);
      fixture = undefined;
    }
  },);

  test("a SQL-shaped world id matches no world and leaks no row", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const hostile = encodeURIComponent("x' OR '1'='1",);
    const res = await app.handle(new Request(`${BASE}/api/worlds/${hostile}`,),);

    // A bound id matches nothing; a concatenated one would satisfy
    // `id = 'x' OR '1'='1'` and return the first visible world.
    expect(res.status,).toBe(404,);
    const body = await res.text();
    expect(body,).not.toContain("Canary Realm",);
    expect(body,).not.toContain("canary description",);
  });

  test("a stacked statement in the world id cannot reach the database", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const hostile = encodeURIComponent("x'; DROP TABLE worlds; --",);
    const res = await app.handle(new Request(`${BASE}/api/worlds/${hostile}`,),);

    expect(res.status,).toBe(404,);

    // The table is intact and the real world still reads.
    const ok = await app.handle(new Request(`${BASE}/api/worlds/${worldId}`,),);
    expect(ok.status,).toBe(200,);
    const world = (await ok.json()) as { name: string; description: string | null };
    expect(world.name,).toBe("Canary Realm",);
    expect(world.description,).toBe("canary description",);
  });

  test("the list filter binds its LIKE value", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds?q=${encodeURIComponent("' OR '1'='1",)}`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { name: string }[]; pagination: { total: number } };
    // A bound pattern matches no name; a concatenated one would leave
    // `name like '%'` in the WHERE clause and return every visible world -
    // the canary included.
    expect(body.pagination.total,).toBe(0,);
    expect(body.data,).toEqual([],);
  });
});
