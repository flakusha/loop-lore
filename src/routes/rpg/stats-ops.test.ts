// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG stat-block operation route tests — POST /api/rpg/stats/calculate,
 * /validate, /generate.
 *
 * Mounts statsRoutes behind the same derive-auth harness as stats.test.ts
 * (no DB rows needed — these handlers are pure computation). Covers success
 * shapes, Elysia validation failures (422), handler-level bad input (400),
 * and auth gating (401).
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { statsRoutes, } from "./stats";

const STATS = { str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 8, };

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-rpg-stats-ops", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(statsRoutes({ database: db, config: {} as never, },),);
}

/**
 * @param url
 * @param body
 */
function postStats(url: string, body: unknown,): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("RPG stat-block operation routes", () => {
  const db = {} as Kysely<DB>;

  test("POST calculate returns floor((stat-10)/2) modifiers", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/calculate", { stats: STATS, },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, number>;
    expect(body.strMod,).toBe(3,);
    expect(body.dexMod,).toBe(2,);
    expect(body.conMod,).toBe(1,);
    expect(body.intMod,).toBe(0,);
    expect(body.wisMod,).toBe(0,);
    expect(body.chaMod,).toBe(-1,);
  });

  test("POST calculate rejects a missing stat block (422)", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/calculate", {},),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST calculate requires auth (401)", async () => {
    const res = await makeApp(db,).handle(
      postStats("http://localhost/api/rpg/stats/calculate", { stats: STATS, },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST validate accepts a legal block", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/validate", { stats: STATS, },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { valid: boolean };
    expect(body.valid,).toBe(true,);
  });

  test("POST validate flags an out-of-range score", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/validate", {
        stats: { ...STATS, str: 99, },
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { valid: boolean };
    expect(body.valid,).toBe(false,);
  });

  test("POST validate rejects a missing stat block (422)", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/validate", {},),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST validate requires auth (401)", async () => {
    const res = await makeApp(db,).handle(
      postStats("http://localhost/api/rpg/stats/validate", { stats: STATS, },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST generate returns the standard array", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/generate", { method: "standard_array", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { method: string; array: number[] };
    expect(body.method,).toBe("standard_array",);
    expect(body.array,).toEqual([15, 14, 13, 12, 10, 8,],);
  });

  test("POST generate 4d6 returns six rolls in [3, 18] mapped to abilities", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/generate", { method: "4d6_drop_lowest", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      method: string;
      stats: Record<string, number>;
      rolls: number[];
    };
    expect(body.method,).toBe("4d6_drop_lowest",);
    expect(body.rolls.length,).toBe(6,);
    const abilities = ["str", "dex", "con", "int", "wis", "cha",];
    abilities.forEach((ability, i,) => {
      expect(body.rolls[i]! >= 3 && body.rolls[i]! <= 18,).toBe(true,);
      expect(body.stats[ability],).toBe(body.rolls[i],);
    },);
  });

  test("POST generate point-buy converts a 27-point allocation", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/generate", {
        method: "point_buy",
        allocation: { str: 7, dex: 6, con: 5, int: 4, wis: 2, cha: 0, },
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { method: string; stats: Record<string, number> };
    expect(body.method,).toBe("point_buy",);
    expect(body.stats,).toEqual({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, },);
  });

  test("POST generate point-buy requires an allocation (400)", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/generate", { method: "point_buy", },),
    );
    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string };
    expect(body.error,).toBe("Point-buy requires allocation",);
  });

  test("POST generate point-buy rejects a non-27-point allocation (400)", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/generate", {
        method: "point_buy",
        allocation: { str: 7, dex: 7, con: 7, int: 7, wis: 7, cha: 7, },
      },),
    );
    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string };
    expect(body.error,).toBe("Invalid point-buy allocation (must total 27 points)",);
  });

  test("POST generate rejects an unknown method (422)", async () => {
    const res = await makeApp(db, "user-1", "user",).handle(
      postStats("http://localhost/api/rpg/stats/generate", { method: "rolled_luck", },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST generate requires auth (401)", async () => {
    const res = await makeApp(db,).handle(
      postStats("http://localhost/api/rpg/stats/generate", { method: "standard_array", },),
    );
    expect(res.status,).toBe(401,);
  });
});
