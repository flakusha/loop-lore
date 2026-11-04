/**
 * Skills Routes tests.
 *
 * Mounts the skills routes behind a stub auth middleware and exercises CRUD,
 * actor-scoped listing, XP, and specialization over a real test DB. Verifies
 * actor-ownership gating (403 for non-owners).
 *
 * Resource contract: one createTestDb per file (ephemeral sqlite), destroyed
 * in afterAll; rows scoped by unique per-test ids; the authz negative-path
 * tests create their own actor/skill fixtures (insertActors + POST) so they
 * pass alone and in any order; no ports, no fixed paths, no sleeps.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { skillsRoutes, } from "./skills";
import { skillsProgressionRoutes, } from "./skills-progression";

const mockDb = {} as any;

describe("skillsRoutes", () => {
  test("exports function", () => {
    expect(typeof skillsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = skillsRoutes({ database: mockDb, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });
});

describe("skills CRUD + progression (auth-gated)", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let actorId: string;
  let skillId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Skillmaster",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    worldId = uid();
    await insertWorlds(db, userId, "Skill World", { id: worldId, } as never,);
    actorId = uid();
    await insertActors(db, "Skill Actor", { id: actorId, owner_id: userId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param actingUserId
   */
  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-skills-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(skillsRoutes({ database: db, config: {} as never, },),)
      .use(skillsProgressionRoutes({ database: db, config: {} as never, },),) as any;
  }

  /**
   * @param res
   */
  async function json(res: Response,): Promise<unknown> {
    return res.json() as unknown;
  }

  /**
   * @param body
   */
  function readId(body: unknown,): string {
    if (typeof body === "object" && body !== null && "id" in body && typeof body.id === "string") {
      return body.id;
    }

    throw new Error("response missing string id",);
  }

  test("create skill returns id", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, worldId, name: "Swordsmanship", category: "combat", },),
      },),
    );

    expect(res.status,).toBe(201,);
    skillId = readId(await json(res,),);
    expect(skillId,).toBeString();
  });

  test("get skill", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${skillId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { name?: string };
    expect(body.name,).toBe("Swordsmanship",);
  });

  test("list actor skills", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/actors/${actorId}?worldId=${worldId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { skills?: unknown[] };
    expect(Array.isArray(body.skills,),).toBe(true,);
    expect(body.skills!.length,).toBeGreaterThanOrEqual(1,);
  });

  test("list skills by category", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/actors/${actorId}/category/combat?worldId=${worldId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { skills?: unknown[] };
    expect(Array.isArray(body.skills,),).toBe(true,);
    expect(body.skills!.length,).toBeGreaterThanOrEqual(1,);
  });

  test("build skill tree", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/actors/${actorId}/tree?worldId=${worldId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { tree?: unknown[] };
    expect(Array.isArray(body.tree,),).toBe(true,);
  });

  test("add XP to expert", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${skillId}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ xpAmount: 600, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { xpGained?: number; newProficiency?: string };
    expect(body.xpGained,).toBe(600,);
    expect(body.newProficiency,).toBe("expert",);
  });

  test("schema rejects negative skill XP, unknown skill 404s", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${skillId}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        // t.Number rejects NaN/Infinity at the schema layer; a negative
        // integer passes the schema and reaches the LevelService-shaped guard.
        body: JSON.stringify({ xpAmount: -5, },),
      },),
    );

    expect(res.status,).toBe(422,);
    const missing = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${uid()}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ xpAmount: 10, },),
      },),
    );

    // Unknown skill id survives schema validation and hits the service guard.
    expect(missing.status,).toBe(404,);
  });

  test("specialize skill", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${skillId}/specialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ specialization: "Heavy Blades", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { specialization?: string };
    expect(body.specialization,).toBe("Heavy Blades",);
  });

  test("update skill", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${skillId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Master Swordsmanship", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { name?: string };
    expect(body.name,).toBe("Master Swordsmanship",);
  });

  test("check prerequisites", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/skills/prerequisites/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, prerequisites: [skillId,], worldId, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { met?: boolean; missing?: unknown[] };
    expect(typeof body.met,).toBe("boolean",);
    expect(Array.isArray(body.missing,),).toBe(true,);
  });

  test("rejects non-owner actor access with 403", async () => {
    const otherUserId = uid();
    const app = authedApp(otherUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/actors/${actorId}`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("unauthenticated skill access → 401", async () => {
    const app = new Elysia({ name: "test-skills-anon", },)
      .use(skillsRoutes({ database: db, config: {} as never, },),)
      .use(skillsProgressionRoutes({ database: db, config: {} as never, },),) as any;

    // Per-test target id: 401 fires before any record fetch, so a random id
    // proves the authN gate without reading shared fixture rows.
    const base = `http://localhost/api/rpg/skills/${uid()}`;
    expect((await app.handle(new Request("http://localhost/api/rpg/skills",),)).status,).toBe(401,);
    expect((await app.handle(new Request(base,),)).status,).toBe(401,);
    expect(
      (
        await app.handle(
          new Request(base, {
            method: "PUT",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ name: "Hijacked", },),
          },),
        )
      ).status,
    ).toBe(401,);

    expect((await app.handle(new Request(base, { method: "DELETE", },),)).status,).toBe(401,);

    expect(
      (
        await app.handle(
          new Request(`${base}/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ xpAmount: 10, },),
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
            body: JSON.stringify({ specialization: "Heavy Blades", },),
          },),
        )
      ).status,
    ).toBe(401,);
  });

  test("non-owner id-scoped skill access → 404, identical to missing", async () => {
    // Per-test fixture (passes alone / in any order): own actor + skill.
    const actor = uid();
    await insertActors(db, "Isolated Skill Actor", { id: actor, owner_id: userId, } as never,);
    const owner = authedApp();
    const created = await owner.handle(
      new Request("http://localhost/api/rpg/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: actor, worldId, name: "Isolated Blade", category: "combat", },),
      },),
    );

    expect(created.status,).toBe(201,);
    const id = readId(await json(created,),);

    const app = authedApp(uid(),);
    const base = `http://localhost/api/rpg/skills/${id}`;

    const owned = await app.handle(new Request(base,),);
    expect(owned.status,).toBe(404,);
    const missing = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${uid()}`,),
    );

    expect(missing.status,).toBe(404,);
    // Not-owned and missing are byte-identical: an id is not an existence oracle.
    expect(await owned.json(),).toEqual(await missing.json(),);

    const put = await app.handle(
      new Request(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Hijacked", },),
      },),
    );

    expect(put.status,).toBe(404,);

    const del = await app.handle(new Request(base, { method: "DELETE", },),);
    expect(del.status,).toBe(404,);

    const xp = await app.handle(
      new Request(`${base}/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ xpAmount: 10, },),
      },),
    );

    expect(xp.status,).toBe(404,);

    const spec = await app.handle(
      new Request(`${base}/specialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ specialization: "Heavy Blades", },),
      },),
    );

    expect(spec.status,).toBe(404,);

    // The owner still sees the (unmutated) skill.
    const still = await owner.handle(new Request(base,),);
    expect(still.status,).toBe(200,);
    expect(((await json(still,)) as { name?: string }).name,).toBe("Isolated Blade",);
  });

  test("list route gates ?actorId= and scopes the cross-actor listing", async () => {
    // Per-test fixture (passes alone / in any order): own actor + skill.
    const actor = uid();
    await insertActors(db, "Isolated List Actor", { id: actor, owner_id: userId, } as never,);
    const owner = authedApp();
    const created = await owner.handle(
      new Request("http://localhost/api/rpg/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: actor, worldId, name: "Isolated Lister", category: "combat", },),
      },),
    );

    expect(created.status,).toBe(201,);
    const id = readId(await json(created,),);

    const stranger = authedApp(uid(),);

    const gated = await stranger.handle(
      new Request(`http://localhost/api/rpg/skills?actorId=${actor}`,),
    );

    expect(gated.status,).toBe(403,);

    const strangerList = await stranger.handle(new Request("http://localhost/api/rpg/skills",),);
    expect(strangerList.status,).toBe(200,);
    const strangerSkills = ((await json(strangerList,)) as { skills: Array<{ id: string }> }).skills;
    expect(strangerSkills.some((s,) => s.id === id),).toBe(false,);

    const ownerList = await owner.handle(new Request("http://localhost/api/rpg/skills",),);
    expect(ownerList.status,).toBe(200,);
    const ownerSkills = ((await json(ownerList,)) as { skills: Array<{ id: string }> }).skills;
    expect(ownerSkills.some((s,) => s.id === id),).toBe(true,);
  });

  test("delete skill", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${skillId}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(200,);

    const afterRes = await app.handle(
      new Request(`http://localhost/api/rpg/skills/${skillId}`,),
    );

    expect(afterRes.status,).toBe(404,);
  });
});
