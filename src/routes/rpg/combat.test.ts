/**
 * Combat Routes tests — stateless resolution endpoints over the pure engine.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { createLogger, } from "../../logger";
import { combatRoutes, } from "./combat";

const mockDb = {} as any;

describe("combatRoutes", () => {
  test("exports function", () => {
    expect(typeof combatRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = combatRoutes({ database: mockDb, } as any,);
    expect(plugin,).toBeDefined();
  });
});

describe("combat resolution (auth-gated)", () => {
  let userId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    userId = "user-combat";
  },);

  afterAll(() => {},);

  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-combat-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(combatRoutes({ database: mockDb, } as any,),) as any;
  }

  async function json<T,>(res: Response,): Promise<T> {
    return res.json() as T;
  }

  const stats = { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8, };
  const attacker = {
    id: "a1",
    name: "Hero",
    hp: 30,
    maxHp: 30,
    ac: 15,
    stats,
    level: 3,
    isNpc: false,
    initiative: 0,
    initiativeMod: 2,
    hasActed: false,
    actions: 1,
    bonusActions: 1,
    reactions: 1,
    conditions: [],
  };
  const target = {
    id: "g1",
    name: "Goblin",
    hp: 7,
    maxHp: 7,
    ac: 12,
    stats: { str: 8, dex: 12, con: 10, int: 8, wis: 8, cha: 6, },
    level: 1,
    isNpc: true,
    initiative: 0,
    initiativeMod: 1,
    hasActed: false,
    actions: 1,
    bonusActions: 1,
    reactions: 1,
    conditions: [],
  };

  test("rolls and sorts initiative", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/combat/initiative", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ combatants: [attacker, target,], },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ combatants: { initiative: number }[] }>(res,);
    expect(body.combatants,).toHaveLength(2,);
    expect(body.combatants[0]!.initiative,).toBeGreaterThanOrEqual(0,);
  });

  test("resolves an attack", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/combat/attack", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          attacker,
          target,
          attackAbility: "str",
          damageDice: 1,
          damageSides: 8,
          damageType: "physical",
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ hit: boolean }>(res,);
    expect(typeof body.hit,).toBe("boolean",);
  });

  test("makes a saving throw", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/combat/save", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ combatant: attacker, ability: "con", dc: 12, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ success: boolean }>(res,);
    expect(typeof body.success,).toBe("boolean",);
  });

  test("applies damage and reports defeat", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/combat/damage", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ combatant: target, amount: 7, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ updated: { hp: number }; defeated: boolean }>(res,);
    expect(body.updated.hp,).toBe(0,);
    expect(body.defeated,).toBe(true,);
  });

  test("heals up to max HP", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/combat/heal", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ combatant: { ...target, hp: 3, }, amount: 10, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ updated: { hp: number } }>(res,);
    expect(body.updated.hp,).toBe(target.maxHp,);
  });

  test("evaluates combat status", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/combat/status", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ combatants: [{ ...target, hp: 0, }, attacker,], },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ combatOver: { over: boolean; winner: string | null } }>(res,);
    expect(body.combatOver.over,).toBe(true,);
    expect(body.combatOver.winner,).toBe("player",);
  });

  test("rejects unauthenticated request", async () => {
    const app = new Elysia()
      .derive({ as: "scoped", }, () => ({ userId: null, userRole: null, }),)
      .use(combatRoutes({ database: mockDb, } as any,),) as any;
    const res = await app.handle(
      new Request("http://localhost/api/rpg/combat/initiative", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ combatants: [attacker,], },),
      },),
    );
    expect(res.status,).toBe(401,);
  });
});
