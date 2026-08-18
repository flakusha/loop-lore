// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle Equipment Durability Routes tests (IS7).
 *
 * Verifies combat-action durability degradation: an actor's equipped items
 * lose `durability` by the combat `damage` amount and the result is persisted
 * to `actor_items`. Also covers actor-ownership gating and missing-actor 404.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { EquipState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { battleEquipmentDurabilityRoutes, } from "./equipment-durability";

const mockDb = {} as any;

describe("battleEquipmentDurabilityRoutes", () => {
  test("exports function", () => {
    expect(typeof battleEquipmentDurabilityRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = battleEquipmentDurabilityRoutes({ database: mockDb, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });
});

describe("combat-use durability degradation", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let actorId: string;
  let itemId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Gear Owner",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "Gear World", { id: worldId, } as never,);
    actorId = uid();
    await insertActors(db, "Knight", { id: actorId, user_id: userId, } as never,);
    itemId = uid();
    await insertActorItems(db, actorId, "Iron Sword", "weapon", {
      id: itemId,
      equipped: EquipState.Equipped,
      durability: 100,
      max_durability: 100,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-durability-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(battleEquipmentDurabilityRoutes({ database: db, config: {} as never, },),) as any;
  }

  async function json(res: Response,) {
    return res.json() as unknown;
  }

  test("degrades equipped item durability and persists it", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/combat-use", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, damage: 25, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as {
      items: { id: string; durability: number; maxDurability: number; broken: boolean }[];
    };
    expect(body.items,).toHaveLength(1,);
    expect(body.items[0]!.id,).toBe(itemId,);
    expect(body.items[0]!.durability,).toBe(75,);
    expect(body.items[0]!.maxDurability,).toBe(100,);
    expect(body.items[0]!.broken,).toBe(false,);

    // Persisted to actor_items.
    const persisted = await db.selectFrom("actor_items",)
      .select("durability",)
      .where("id", "=", itemId,)
      .executeTakeFirst();
    expect(persisted?.durability,).toBe(75,);
  });

  test("defaults damage to 10 when omitted", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/combat-use", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as {
      items: { durability: number; maxDurability: number }[];
    };
    expect(body.items[0]!.durability,).toBe(65,); // 75 - 10
    expect(body.items[0]!.maxDurability,).toBe(100,);
  });

  test("rejects combat-use by a non-owner with 403", async () => {
    const strangerUser = uid();
    await insertUsers(
      db,
      `stranger-${strangerUser}`,
      "Stranger",
      { id: strangerUser, role: "solo", status: "active", settings: "{}", } as never,
    );
    const app = authedApp(strangerUser,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/combat-use", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("returns 404 for an unknown actor", async () => {
    const unknownActorId = uid();
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/combat-use", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: unknownActorId, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });
});
