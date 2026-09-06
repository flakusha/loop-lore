// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Dice route tests — POST /api/rpg/dice/roll, /notation, /advantage.
 *
 * Mounts diceRoutes behind the same derive-auth harness as stats.test.ts
 * over a real in-memory DB. Covers success shapes, Elysia validation
 * failures (422), handler-level bad input (400), and auth gating (401).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { diceRoutes, } from "./dice";

interface DiceResult {
  dice: { sides: number; value: number }[];
  rawTotal: number;
  modifier: number;
  total: number;
  advantageMode: string;
}

/**
 * @param res
 */
async function jsonOf(res: Response,): Promise<DiceResult> {
  return res.json() as Promise<DiceResult>;
}

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-rpg-dice", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(diceRoutes({ database: db, config: {} as never, },),);
}

/**
 * @param url
 * @param body
 */
function postDice(url: string, body: unknown,): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("RPG dice routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "dicer", "Dicer", { id: "dice-user" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("POST roll returns dice summing to rawTotal plus modifier", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/roll", { sides: 20, count: 2, modifier: 3, },),
    );
    expect(res.status,).toBe(200,);
    const body = await jsonOf(res,);
    expect(body.dice.length,).toBe(2,);
    for (const die of body.dice) {
      expect(die.sides,).toBe(20,);
      expect(die.value >= 1 && die.value <= 20,).toBe(true,);
    }
    const sum = body.dice.reduce((acc, die,) => acc + die.value, 0,);
    expect(body.rawTotal,).toBe(sum,);
    expect(body.total,).toBe(sum + 3,);
    expect(body.advantageMode,).toBe("normal",);
  });

  test("POST roll persists a history row for the user", async () => {
    const before = await db
      .selectFrom("dice_roll_history",)
      .select(db.fn.countAll<number>().as("total",),)
      .where("user_id", "=", "dice-user",)
      .executeTakeFirst();
    await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/roll", { sides: 6, },),
    );
    const after = await db
      .selectFrom("dice_roll_history",)
      .select(db.fn.countAll<number>().as("total",),)
      .where("user_id", "=", "dice-user",)
      .executeTakeFirst();
    expect((after?.total ?? 0) - (before?.total ?? 0),).toBe(1,);
  });

  test("POST roll defaults to a single die", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/roll", { sides: 8, },),
    );
    expect(res.status,).toBe(200,);
    const body = await jsonOf(res,);
    expect(body.dice.length,).toBe(1,);
    expect(body.total,).toBe(body.rawTotal,);
  });

  test("POST roll supports exploding dice", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/roll", { sides: 6, count: 3, exploding: true, },),
    );
    expect(res.status,).toBe(200,);
    const body = await jsonOf(res,);
    expect(body.dice.length >= 3,).toBe(true,);
  });

  test("POST roll rejects unknown sides (422)", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/roll", { sides: 7, },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST roll rejects count below 1 (422)", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/roll", { sides: 6, count: 0, },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST roll requires auth (401)", async () => {
    const res = await makeApp(db,).handle(
      postDice("http://localhost/api/rpg/dice/roll", { sides: 20, },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST notation rolls 2d6+3 with modifier applied", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/notation", { notation: "2d6+3", },),
    );
    expect(res.status,).toBe(200,);
    const body = await jsonOf(res,);
    expect(body.dice.length,).toBe(2,);
    expect(body.total,).toBe(body.rawTotal + 3,);
  });

  test("POST notation rejects invalid notation (400)", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/notation", { notation: "zzz", },),
    );
    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string };
    expect(body.error,).toBe("Invalid dice notation",);
  });

  test("POST notation rejects empty notation (422)", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/notation", { notation: "", },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST notation requires auth (401)", async () => {
    const res = await makeApp(db,).handle(
      postDice("http://localhost/api/rpg/dice/notation", { notation: "d20", },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST advantage rolls 2d20 and echoes the mode", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/advantage", { advantage: "advantage", },),
    );
    expect(res.status,).toBe(200,);
    const body = await jsonOf(res,);
    expect(body.advantageMode,).toBe("advantage",);
    expect(body.dice.length,).toBe(2,);
  });

  test("POST disadvantage applies modifier to the total", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/advantage", { advantage: "disadvantage", modifier: 2, },),
    );
    expect(res.status,).toBe(200,);
    const body = await jsonOf(res,);
    expect(body.advantageMode,).toBe("disadvantage",);
    expect(body.total,).toBe(body.rawTotal + 2,);
  });

  test("POST advantage defaults to a normal single d20", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/advantage", {},),
    );
    expect(res.status,).toBe(200,);
    const body = await jsonOf(res,);
    expect(body.advantageMode,).toBe("normal",);
    expect(body.dice.length,).toBe(1,);
  });

  test("POST advantage rejects unknown mode (422)", async () => {
    const res = await makeApp(db, "dice-user", "user",).handle(
      postDice("http://localhost/api/rpg/dice/advantage", { advantage: "luck", },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST advantage requires auth (401)", async () => {
    const res = await makeApp(db,).handle(
      postDice("http://localhost/api/rpg/dice/advantage", { advantage: "advantage", },),
    );
    expect(res.status,).toBe(401,);
  });
});
