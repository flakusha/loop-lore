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
 * no fixed paths, no sleeps. The authz negative-path tests create their own
 * actor/profession fixtures (insertActors + POST) so they pass alone and in
 * any order.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { ProfessionsService, } from "../../rpg/crafting/professions/index";
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

  test("unauthenticated id-scoped access → 401", async () => {
    const app = new Elysia({ name: "test-professions-anon-id", },)
      .use(professionsRoutes({ database: db, config: {} as never, },),) as any;

    const base = `http://localhost/api/rpg/professions/${uid()}`;
    expect((await app.handle(new Request(base,),)).status,).toBe(401,);
    expect(
      (
        await app.handle(
          new Request(`${base}/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ amount: 10, },),
          },),
        )
      ).status,
    ).toBe(401,);

    expect(
      (
        await app.handle(
          new Request(`${base}/specialize`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ name: "Rune Weaving", bonusType: "quality", bonusValue: 5, },),
          },),
        )
      ).status,
    ).toBe(401,);
  });

  test("actor listing scopes by world, including the world-less scope", async () => {
    // Own fixture (isolation-safe): one actor, one world-bound + one world-less profession.
    const actor = uid();
    await insertActors(db, "Scoped Listing Actor", { id: actor, owner_id: userId, } as never,);
    const app = authedApp();
    const mk = (discipline: string, world?: string,) =>
      app.handle(
        new Request("http://localhost/api/rpg/professions", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ actorId: actor, ...(world === undefined ? {} : { worldId: world, }), discipline, },),
        },),
      );

    expect((await mk("smithing", worldId,)).status,).toBe(201,);
    expect((await mk("cooking",)).status,).toBe(201,);

    const allRes = await app.handle(
      new Request(`http://localhost/api/rpg/professions/actors/${actor}`,),
    );

    expect(allRes.status,).toBe(200,);
    const all = ((await json(allRes,)).professions as Array<{ discipline: string }>).map((p,) => p.discipline).sort();
    expect(all,).toEqual(["cooking", "smithing",],);

    const scopedRes = await app.handle(
      new Request(`http://localhost/api/rpg/professions/actors/${actor}?worldId=${worldId}`,),
    );

    expect(scopedRes.status,).toBe(200,);
    expect(((await json(scopedRes,)).professions as Array<{ discipline: string }>).map((p,) => p.discipline),).toEqual([
      "smithing",
    ],);

    const worldlessRes = await app.handle(
      new Request(`http://localhost/api/rpg/professions/actors/${actor}?worldId=`,),
    );

    expect(worldlessRes.status,).toBe(200,);
    expect(((await json(worldlessRes,)).professions as Array<{ discipline: string }>).map((p,) => p.discipline),)
      .toEqual(["cooking",],);
  });

  test("route catch blocks map unexpected service failures to 500", async () => {
    // Each id-scoped/actor route logs and returns 500 when the service throws
    // something the mapper does not recognize — the caller's fix is to retry,
    // not to change the request.
    const app = authedApp();
    const spies = [
      spyOn(ProfessionsService.prototype, "getActorProfessions",).mockRejectedValue(new Error("boom",),),
      spyOn(ProfessionsService.prototype, "createProfession",).mockRejectedValue(new Error("boom",),),
      spyOn(ProfessionsService.prototype, "getProfession",).mockRejectedValue(new Error("boom",),),
      spyOn(ProfessionsService.prototype, "addExperience",).mockRejectedValue(new Error("boom",),),
      spyOn(ProfessionsService.prototype, "addSpecialization",).mockRejectedValue(new Error("boom",),),
    ];

    try {
      const listed = await app.handle(
        new Request(`http://localhost/api/rpg/professions/actors/${actorId}`,),
      );

      expect(listed.status,).toBe(500,);
      expect((await json(listed,)).error,).toBe("Internal server error",);

      const created = await app.handle(
        new Request("http://localhost/api/rpg/professions", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ actorId, worldId, discipline: "cooking", },),
        },),
      );

      expect(created.status,).toBe(500,);

      expect((await app.handle(new Request(`http://localhost/api/rpg/professions/${professionId}`,),)).status,).toBe(
        500,
      );

      expect(
        (await app.handle(
          new Request(`http://localhost/api/rpg/professions/${professionId}/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ amount: 10, },),
          },),
        )).status,
      ).toBe(500,);

      expect(
        (await app.handle(
          new Request(`http://localhost/api/rpg/professions/${professionId}/specialize`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ name: "Ghost", bonusType: "quality", bonusValue: 1, },),
          },),
        )).status,
      ).toBe(500,);
    } finally {
      for (const s of spies) { s.mockRestore(); }
    }
  });

  test("xp maps service validation errors to 400 and service 404s to 404", async () => {
    // The schema layer only enforces minimum: 1, so a service-side amount
    // rejection surfaces the service message (not a generic 500).
    const app = authedApp();
    const amountSpy = spyOn(ProfessionsService.prototype, "addExperience",)
      .mockRejectedValue(new Error("XP amount must be a finite positive number",),);

    try {
      const bad = await app.handle(
        new Request(`http://localhost/api/rpg/professions/${professionId}/xp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ amount: 10, },),
        },),
      );

      expect(bad.status,).toBe(400,);
      expect((await json(bad,)).error,).toBe("XP amount must be a finite positive number",);
    } finally {
      amountSpy.mockRestore();
    }

    // A service-side unknown id (lost between the ownership lookup and the
    // mutation) maps to the same byte-identical 404 as a missing row.
    const goneSpy = spyOn(ProfessionsService.prototype, "addExperience",)
      .mockRejectedValue(new Error("Profession not found",),);

    try {
      const gone = await app.handle(
        new Request(`http://localhost/api/rpg/professions/${professionId}/xp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ amount: 10, },),
        },),
      );

      expect(gone.status,).toBe(404,);
    } finally {
      goneSpy.mockRestore();
    }
  });

  test("specialize maps a service-side unknown id to 404", async () => {
    // Same race as XP: the row vanishes after the ownership lookup.
    const app = authedApp();
    const goneSpy = spyOn(ProfessionsService.prototype, "addSpecialization",)
      .mockRejectedValue(new Error("Profession not found",),);

    try {
      const gone = await app.handle(
        new Request(`http://localhost/api/rpg/professions/${professionId}/specialize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: "Ghost", bonusType: "quality", bonusValue: 1, },),
        },),
      );

      expect(gone.status,).toBe(404,);
    } finally {
      goneSpy.mockRestore();
    }
  });

  test("non-owner id-scoped access → 404, identical to missing", async () => {
    // Per-test fixture (passes alone / in any order): own actor + profession.
    const actor = uid();
    await insertActors(db, "Isolated Profession Actor", { id: actor, owner_id: userId, } as never,);
    const owner = authedApp();
    const created = await owner.handle(
      new Request("http://localhost/api/rpg/professions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: actor, worldId, discipline: "enchanting", },),
      },),
    );

    expect(created.status,).toBe(201,);
    const id = (await json(created,)).id as string;

    const app = authedApp(uid(),);
    const base = `http://localhost/api/rpg/professions/${id}`;

    const owned = await app.handle(new Request(base,),);
    expect(owned.status,).toBe(404,);
    const missing = await app.handle(
      new Request(`http://localhost/api/rpg/professions/${uid()}`,),
    );

    expect(missing.status,).toBe(404,);
    // Not-owned and missing are byte-identical: an id is not an existence oracle.
    expect(await owned.json(),).toEqual(await missing.json(),);

    const xp = await app.handle(
      new Request(`${base}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ amount: 10, },),
      },),
    );

    expect(xp.status,).toBe(404,);

    const spec = await app.handle(
      new Request(`${base}/specialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Hijack", bonusType: "quality", bonusValue: 1, },),
      },),
    );

    expect(spec.status,).toBe(404,);

    // The owner still sees the profession; the stranger mutated nothing.
    expect((await owner.handle(new Request(base,),)).status,).toBe(200,);
  });
});
