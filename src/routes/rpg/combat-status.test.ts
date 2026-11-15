// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Combat status route tests — stateless engine endpoints, no DB needed.
 * Covers the happy path of each of the five endpoints plus the auth gate.
 * The handler catch blocks are unreachable via HTTP (Elysia schema
 * validation rejects malformed bodies with 422 before the handler runs).
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { initCombatant, } from "../../rpg/combat";
import type { Combatant, } from "../../rpg/combat";
import { combatStatusRoutes, } from "./combat-status";

const STATS = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 8, };

function makeCombatant(): Combatant {
  return initCombatant("c1", "Fighter", STATS, 3, 24, 15, false,);
}

function authedApp(): Elysia {
  return new Elysia({ name: "test-combat-status", },)
    .derive({ as: "scoped", }, () => ({ userId: "user1", userRole: "user", }),)
    .use(combatStatusRoutes({ database: {} as never, config: {} as never, },),) as unknown as Elysia;
}

function anonApp(): Elysia {
  return new Elysia({ name: "test-combat-status-anon", },)
    .use(combatStatusRoutes({ database: {} as never, config: {} as never, },),) as unknown as Elysia;
}

/**
 * @param app
 * @param path
 * @param body
 */
function post(app: Elysia, path: string, body: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

describe("combat status routes", () => {
  test("status requires auth", async () => {
    const res = await post(anonApp(), "/api/rpg/combat/status", { combatants: [makeCombatant(),], },);
    expect(res.status,).toBe(401,);
  });

  test("status evaluates combatants", async () => {
    const dead = { ...makeCombatant(), id: "c2", hp: 0, };
    const res = await post(authedApp(), "/api/rpg/combat/status", { combatants: [makeCombatant(), dead,], },);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { perCombatant: { id: string; dead: boolean }[] };
    expect(body.perCombatant,).toHaveLength(2,);
    expect(body.perCombatant.find((c,) => c.id === "c2")?.dead,).toBe(true,);
  });

  test("action requires auth", async () => {
    const res = await post(anonApp(), "/api/rpg/combat/action", { combatant: makeCombatant(), type: "attack", },);
    expect(res.status,).toBe(401,);
  });

  test("action checks and consumes", async () => {
    const res = await post(authedApp(), "/api/rpg/combat/action", {
      combatant: makeCombatant(),
      type: "attack",
      consume: true,
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { allowed: boolean; updated: Combatant };
    expect(body.allowed,).toBe(true,);
    expect(body.updated.hasActed,).toBe(true,);
  });

  test("init-combatant requires auth", async () => {
    const res = await post(anonApp(), "/api/rpg/combat/init-combatant", {
      id: "c9",
      name: "Rogue",
      stats: STATS,
      level: 2,
      hp: 18,
      ac: 14,
      isNpc: true,
    },);

    expect(res.status,).toBe(401,);
  });

  test("init-combatant builds a combatant", async () => {
    const res = await post(authedApp(), "/api/rpg/combat/init-combatant", {
      id: "c9",
      name: "Rogue",
      stats: STATS,
      level: 2,
      hp: 18,
      ac: 14,
      isNpc: true,
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { combatant: Combatant };
    expect(body.combatant.id,).toBe("c9",);
    expect(body.combatant.actions,).toBe(1,);
  });

  test("reset-turn requires auth", async () => {
    const res = await post(anonApp(), "/api/rpg/combat/reset-turn", { combatant: makeCombatant(), },);
    expect(res.status,).toBe(401,);
  });

  test("reset-turn restores actions", async () => {
    const spent = { ...makeCombatant(), actions: 0, hasActed: true, };
    const res = await post(authedApp(), "/api/rpg/combat/reset-turn", { combatant: spent, },);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { updated: Combatant };
    expect(body.updated.actions,).toBe(1,);
  });

  test("reset-round requires auth", async () => {
    const res = await post(anonApp(), "/api/rpg/combat/reset-round", { combatants: [makeCombatant(),], },);
    expect(res.status,).toBe(401,);
  });

  test("reset-round restores reactions", async () => {
    const spent = { ...makeCombatant(), reactions: 0, };
    const res = await post(authedApp(), "/api/rpg/combat/reset-round", { combatants: [spent,], },);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { updated: Combatant[] };
    expect(body.updated[0]?.reactions,).toBeGreaterThan(0,);
  });

  test("schema-invalid bodies never reach the handler", async () => {
    const res = await post(authedApp(), "/api/rpg/combat/status", { combatants: [{ id: "x", },], },);
    expect(res.status,).toBe(422,);
  });
});
