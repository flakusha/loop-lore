// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { EquipState, } from "../../../db/enums.js";
import type { DB, } from "../../../db/schema.js";
import { createLogger, } from "../../../logger/index.js";
import type { Combatant, } from "../../../rpg/combat.js";
import type { StatBlock, } from "../../../rpg/stats.js";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import { insertActorItems, insertActors, insertUsers, } from "../../../test-utils/insert-helpers.js";
import { buildCombatant, } from "../battles.js";
import { readLiveWearAccrual, reconcileBattleWear, snapshotBattlePrep, } from "./reconciliation.js";

const stats: StatBlock = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 6, };

describe("battle reconciliation", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  it("snapshots prep and settles wear by damage dealt", async () => {
    const userId = `user-${Date.now()}`;
    await insertUsers(
      db,
      userId,
      "Gear Owner",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    const actorId = `actor-${Date.now()}`;
    await insertActors(db, "Knight", { id: actorId, user_id: userId, } as never,);
    const itemId = `item-${Date.now()}`;
    await insertActorItems(db, actorId, "Iron Sword", "weapon", {
      id: itemId,
      equipped: EquipState.Equipped,
      durability: 100,
      max_durability: 100,
    } as never,);

    const snaps = await snapshotBattlePrep(db, [actorId,],);
    expect(snaps[0]?.items,).toEqual([{ id: itemId, name: "Iron Sword", durability: 100, },],);

    const combatant = buildCombatant(actorId, "Alice", stats, 5, 30, 16, false,) as Combatant;
    const worn = await reconcileBattleWear(db, [combatant,], new Map([[actorId, 25,],],),);
    expect(worn.get(actorId,)?.[0]?.durability,).toBe(75,);

    const persisted = await db.selectFrom("actor_items",)
      .select("durability",).where("id", "=", itemId,).executeTakeFirst();

    expect(persisted?.durability,).toBe(75,);
  });

  it("skips NPCs, the fallen, and zero-damage actors", async () => {
    const orc = buildCombatant("orc", "Orc", stats, 5, 0, 16, true,) as Combatant;
    const worn = await reconcileBattleWear(db, [orc,], new Map([["orc", 50,],],),);
    expect(worn.size,).toBe(0,);
  });

  it("skips prep staging on ambush", async () => {
    const snaps = await snapshotBattlePrep(db, [`actor-ambush-${Date.now()}`,], true,);
    expect(snaps,).toEqual([],);
  });

  it("reads live wear accrual from the log", () => {
    const accrual = readLiveWearAccrual([
      { actorId: "a1", damage: 8, },
      { actorId: "a1", damage: 4, },
      { actorId: "a2", },
    ],);

    expect(accrual.get("a1",),).toBe(12,);
    expect(accrual.has("a2",),).toBe(false,);
  });
});
