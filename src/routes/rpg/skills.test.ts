/**
 * Skills Routes tests.
 *
 * Mounts the skills routes behind a stub auth middleware and exercises CRUD,
 * actor-scoped listing, XP, and specialization over a real test DB. Verifies
 * actor-ownership gating (403 for non-owners).
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
