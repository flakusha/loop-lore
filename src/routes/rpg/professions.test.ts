// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Professions Routes tests.
 *
 * Mounts the professions routes behind a stub auth middleware and exercises
 * the five endpoints over a real test DB, including ownership gating (403),
 * XP level-up, and specialization requirement failures.
 *
 * Parallel-safe: one createTestDb per file, unique ids per test, no ports,
 * no fixed paths, no sleeps.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { professionsRoutes, } from "./professions";

// Resource contract: one createTestDb per file (ephemeral sqlite), rows
// scoped by unique ids, destroyed in afterAll; no ports or sleeps.

describe("professionsRoutes", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let actorId: string;
  let professionId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${uid()}`,
      "Profession Master",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    worldId = uid();
    await insertWorlds(db, userId, "Profession World", { id: worldId, } as never,);
    actorId = uid();
    await insertActors(db, "Profession Actor", { id: actorId, owner_id: userId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param actingUserId
   */
  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-professions-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(professionsRoutes({ database: db, config: {} as never, },),) as any;
  }

  /**
   * @param res
   */
  async function json(res: Response,): Promise<Record<string, unknown>> {
    return (await res.json()) as Record<string, unknown>;
  }

  test("unauthenticated create → 401", async () => {
    const app = new Elysia({ name: "test-professions-anon", },)
      .use(professionsRoutes({ database: db, config: {} as never, },),) as any;

    const res = await app.handle(
      new Request("http://localhost/api/rpg/professions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, worldId, discipline: "alchemy", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("create profession returns 201 with title from level", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/professions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, worldId, discipline: "alchemy", level: 30, },),
      },),
    );

    expect(res.status,).toBe(201,);
    const body = await json(res,);
    professionId = body.id as string;
    expect(professionId,).toBeString();
    expect(body.title,).toBe("journeyman",);
  });

  test("duplicate discipline → 400", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/professions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, worldId, discipline: "alchemy", },),
      },),
    );

    expect(res.status,).toBe(400,);
  });

  test("non-owner create → 403", async () => {
    const otherUserId = uid();
    await insertUsers(
      db,
      `user-${otherUserId}`,
      "Other Owner",
      { id: otherUserId, role: "user", status: "active", settings: "{}", } as never,
    );

    const other = uid();
    await insertActors(db, "Other Actor", { id: other, owner_id: otherUserId, } as never,);
    const app = authedApp(uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/rpg/professions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: other, worldId, discipline: "smithing", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });

  test("actor listing returns the created profession", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/professions/actors/${actorId}?worldId=${worldId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = await json(res,);
    const professions = body.professions as Array<{ discipline: string }>;
    expect(professions.map(p => p.discipline),).toEqual(["alchemy",],);
  });

  test("get profession by id", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${professionId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = await json(res,);
    expect(body.id,).toBe(professionId,);
  });

  test("get unknown profession → 404", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${uid()}`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("xp endpoint levels up; invalid amount → 400; unknown id → 404", async () => {
    const app = authedApp();
    const ok = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${professionId}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ amount: 100, },),
      },),
    );

    expect(ok.status,).toBe(200,);
    expect((await json(ok,)).newLevel as number,).toBe(31,);

    const bad = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${professionId}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ amount: 0, },),
      },),
    );

    // amount=0 violates the body schema (minimum 1) → 422 at the schema layer
    // (the skills xp route handles negative amounts the same way).
    expect(bad.status,).toBe(422,);

    const missing = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${uid()}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ amount: 10, },),
      },),
    );

    expect(missing.status,).toBe(404,);
  });

  test("specialize stores and enforces requirement level", async () => {
    const app = authedApp();
    const ok = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${professionId}/specialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Rune Weaving", bonusType: "quality", bonusValue: 5, },),
      },),
    );

    expect(ok.status,).toBe(201,);

    const early = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${professionId}/specialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Too Early", bonusType: "speed", bonusValue: 5, requirementLevel: 99, },),
      },),
    );

    expect(early.status,).toBe(400,);

    const missing = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${uid()}/specialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "X", bonusType: "success", bonusValue: 1, },),
      },),
    );

    expect(missing.status,).toBe(404,);
  });
});
