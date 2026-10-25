// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle item + social action tests over a real test DB, plus the pure
 * helpers (`onUseHealAmount`, `usableBattleItems`, `findUsableItem`,
 * `parseSocialAction`, `splitItemArgs`, `actingCombatant`, `formatBattle`,
 * `serializeBattle`) they are built from.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { splitItemArgs, } from "../../assistant/commands/battle-actions.js";
import {
  actingCombatant,
  formatBattle,
  serializeBattle,
} from "../../assistant/commands/battle-utils.js";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import type { Combatant, } from "../../rpg/combat.js";
import type { StatBlock, } from "../../rpg/stats.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import {
  insertActorItems,
  insertActors,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers.js";
import { uid, } from "../../utils.js";
import {
  findUsableItem,
  getBattle,
  listUsableBattleItems,
  onUseHealAmount,
  performSocialAction,
  startBattle,
  usableBattleItems,
  useBattleItem,
} from "./battles.js";
import { persistBattle, } from "./battles/persistence.js";
import {
  BATTLE_SOCIAL_ACTIONS,
  BattleStatus,
  buildCombatant,
  parseSocialAction,
} from "./battles/types.js";

const stats: StatBlock = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 6, };

/** Metadata JSON encoding an on-use heal effect. */
const healMeta = (amount: number,): string =>
  JSON.stringify({ effects: [{ kind: "on_use", action: "heal", payload: { amount, }, },], },);

/**
 * @param id
 * @param name
 * @param isNpc
 * @param hp
 */
function makeCombatant(id: string, name: string, isNpc: boolean, hp = 30,): Combatant {
  return buildCombatant(id, name, stats, 5, hp, 16, isNpc,);
}

/** Seed world + actor so `actor_items` FKs resolve. */
async function seedActor(
  database: Kysely<DB>,
  owner: string,
  actorId: string,
): Promise<void> {
  const worldId = uid();
  await insertWorlds(database, owner, "Battle World", { id: worldId, } as never,);
  await insertActors(database, "Fighter", { id: actorId, user_id: owner, } as never,);
  await insertItems(database, worldId, "Healing Draught", "consumable", {} as never,);
  await insertItems(database, worldId, "Rusty Sword", "weapon", {} as never,);
}

describe("battle item helpers (pure)", () => {
  it("onUseHealAmount reads both metadata encodings and rejects junk", () => {
    expect(onUseHealAmount(healMeta(7,),),).toBe(7,);
    expect(onUseHealAmount(JSON.stringify([{ kind: "on_use", action: "heal", payload: { amount: 3, }, },],),),).toBe(
      3,
    );

    expect(onUseHealAmount(JSON.stringify({ kind: "on_use", action: "heal", payload: { amount: 3, }, },),),).toBeNull();
    expect(onUseHealAmount(JSON.stringify({ effects: [{ kind: "passive", },], },),),).toBeNull();
    expect(onUseHealAmount("not json",),).toBeNull();
    expect(onUseHealAmount(null,),).toBeNull();
    expect(
      onUseHealAmount(JSON.stringify({ effects: [{ kind: "on_use", action: "heal", payload: { amount: -1, }, },], },),),
    ).toBeNull();
  });

  it("usableBattleItems keeps stocked heal consumables, name-sorted", () => {
    const rows = [
      { id: "1", name: "Zed Potion", quantity: 2, item_type: "consumable", metadata: healMeta(5,), },
      { id: "2", name: "Empty Flask", quantity: 0, item_type: "consumable", metadata: healMeta(5,), },
      { id: "3", name: "Sword", quantity: 1, item_type: "weapon", metadata: healMeta(5,), },
      { id: "4", name: "Plain Bread", quantity: 3, item_type: "consumable", metadata: null, },
      { id: "5", name: "Aloe Salve", quantity: 1, item_type: "consumable", metadata: healMeta(2,), },
    ] as Parameters<typeof usableBattleItems>[0];

    expect(usableBattleItems(rows,).map((i,) => i.name),).toEqual(["Aloe Salve", "Zed Potion",],);
  });

  it("findUsableItem matches id, exact name, then loose name", () => {
    const items = [
      { id: "row-1", name: "Healing Draught", quantity: 1, },
      { id: "row-2", name: "Antidote", quantity: 1, },
    ];

    expect(findUsableItem(items, "row-2",)?.name,).toBe("Antidote",);
    expect(findUsableItem(items, "healing draught",)?.id,).toBe("row-1",);
    expect(findUsableItem(items, "dote",)?.name,).toBe("Antidote",);
    expect(findUsableItem(items, "  ",),).toBeNull();
    expect(findUsableItem(items, "nope",),).toBeNull();
  });

  it("parseSocialAction accepts canonical verbs (case-insensitive) only", () => {
    for (const verb of BATTLE_SOCIAL_ACTIONS) {
      expect(parseSocialAction(verb.toUpperCase(),),).toBe(verb,);
    }

    expect(parseSocialAction("  flee ",),).toBeNull();
    expect(parseSocialAction(undefined,),).toBeNull();
  });

  it("splitItemArgs greedily binds leading args to item names", () => {
    const items = [{ id: "i1", name: "Healing Draught", quantity: 1, },];
    expect(splitItemArgs(items, ["healing", "draught", "orc",],),).toEqual({
      item: items[0]!,
      targetArgs: ["draught", "orc",],
    },);

    expect(splitItemArgs(items, ["i1",],),).toEqual({ item: items[0]!, targetArgs: [], },);
    expect(splitItemArgs(items, ["mystery",],),).toBeNull();
    expect(splitItemArgs(items, [],),).toBeNull();
  });

  it("actingCombatant prefers player-side roster entries", () => {
    const battle = {
      combatants: [makeCombatant("orc", "Orc", true,), makeCombatant("alice", "Alice", false,),],
      turnIndex: 0,
    } as Parameters<typeof actingCombatant>[0];

    expect(actingCombatant(battle,)?.id,).toBe("alice",);
    expect(actingCombatant({ ...battle, combatants: [], },),).toBeNull();
    expect(actingCombatant({ ...battle, combatants: [makeCombatant("solo", "Solo", true,),], },)?.id,)
      .toBe("solo",);
  });

  it("formatBattle renders round, roster HP/AC, and the acting turn", () => {
    const battle = {
      status: "active",
      round: 2,
      turnIndex: 1,
      combatants: [makeCombatant("alice", "Alice", false,), makeCombatant("orc", "Orc", true, 0,),],
    } as Parameters<typeof formatBattle>[0];

    const text = formatBattle(battle,);
    expect(text,).toContain("Round 2",);
    expect(text,).toContain("HP 30/30",);
    expect(text,).toContain("💀",);
    expect(text,).toContain("Orc's turn.",);
  });

  it("serializeBattle maps the roster and carries usable items", () => {
    const battle = {
      id: "b1",
      status: "active",
      round: 1,
      turnIndex: 0,
      combatants: [makeCombatant("alice", "Alice", false, 12,),],
    } as Parameters<typeof serializeBattle>[0];

    const view = serializeBattle(battle, [{ id: "i1", name: "Draught", quantity: 2, },],);
    expect(view,).toMatchObject({ id: "b1", round: 1, turnIndex: 0, status: "active", },);
    expect(view.items,).toHaveLength(1,);
    expect(view.combatants[0],).toEqual({
      id: "alice",
      name: "Alice",
      hp: 12,
      maxHp: 12,
      initiative: view.combatants[0]!.initiative,
    },);
  });
});

describe("battle item + social service", () => {
  let db: Kysely<DB>;
  let sqlite: import("bun:sqlite").Database;
  let createdBy: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    createdBy = uid();
    await insertUsers(
      db,
      `user-${createdBy}`,
      "Item User",
      { id: createdBy, role: "solo", status: "active", settings: "{}", } as never,
    );
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  it("listUsableBattleItems returns the actor's stocked heal consumables", async () => {
    const actorId = uid();
    await seedActor(db, createdBy, actorId,);
    await insertActorItems(db, actorId, "Healing Draught", "consumable" as never, {
      id: "dr-1",
      quantity: 3,
      metadata: healMeta(8,),
    },);

    await insertActorItems(db, actorId, "Rusty Sword", "weapon" as never, { id: "sw-1", quantity: 1, },);

    const items = await listUsableBattleItems({ database: db, }, actorId,);
    expect(items,).toEqual([{ id: "dr-1", name: "Healing Draught", quantity: 3, },],);
  });

  it("useBattleItem heals the target, logs the action, and consumes one unit", async () => {
    const actorId = uid();
    await seedActor(db, createdBy, actorId,);
    await insertActorItems(db, actorId, "Healing Draught", "consumable" as never, {
      id: "dr-2",
      quantity: 2,
      metadata: healMeta(6,),
    },);

    const battle = await startBattle({ database: db, }, {
      chatId: uid(),
      createdBy,
      combatants: [makeCombatant(actorId, "Alice", false, 20,), makeCombatant("orc", "Orc", true, 15,),],
    },);

    // Damage the target so the heal has room to land.
    const orc = battle.combatants.find((c,) => c.id === "orc")!;
    orc.hp = 10;
    await persistBattle(
      { database: db, },
      battle.id,
      battle.round,
      battle.turnIndex,
      battle.combatants,
      battle.log,
      BattleStatus.Active,
    );

    const result = await useBattleItem({ database: db, }, {
      battleId: battle.id,
      actorId,
      targetId: "orc",
      itemId: "Healing Draught",
    },);

    // healCombatant scales the raw amount; assert the invariant, not the magic number.
    expect(result.healed,).toBe(result.target.hp - 10,);
    expect(result.healed,).toBeGreaterThan(0,);
    expect(result.item.quantity,).toBe(1,);
    expect(result.combatants.find((c,) => c.id === "orc")?.hp,).toBe(result.target.hp,);

    // The actor spent its item action; the log persisted the UseItem entry.
    const reloaded = await getBattle({ database: db, }, battle.id,);
    expect(reloaded!.log.at(-1,)?.type,).toBe("use_item",);

    // Stock decremented in the inventory.
    const remaining = await listUsableBattleItems({ database: db, }, actorId,);
    expect(remaining[0]?.quantity,).toBe(1,);
  });

  it("useBattleItem does not consume inventory when the battle persist fails (BUG-usebattleitem-consumes-inventory-and-persists-battle-outside)", async () => {
    const actorId = uid();
    await seedActor(db, createdBy, actorId,);
    await insertActorItems(db, actorId, "Healing Draught", "consumable" as never, {
      id: "dr-tx-rollback",
      quantity: 2,
      metadata: healMeta(6,),
    },);

    const battle = await startBattle({ database: db, }, {
      chatId: uid(),
      createdBy,
      combatants: [makeCombatant(actorId, "Alice", false, 20,), makeCombatant("orc-tx", "Orc", true, 15,),],
    },);

    const orc = battle.combatants.find((c,) => c.id === "orc-tx")!;
    orc.hp = 10;
    await persistBattle(
      { database: db, },
      battle.id,
      battle.round,
      battle.turnIndex,
      battle.combatants,
      battle.log,
      BattleStatus.Active,
    );

    // Fail the SECOND write (persistBattle) after the inventory consumption.
    sqlite.exec(
      `CREATE TRIGGER fail_battle_persist_tx BEFORE UPDATE ON battles
       WHEN OLD.id = '${battle.id}' BEGIN SELECT RAISE(ABORT, 'simulated persist failure'); END;`,
    );

    try {
      await expect(useBattleItem({ database: db, }, {
        battleId: battle.id,
        actorId,
        targetId: "orc-tx",
        itemId: "Healing Draught",
      },),).rejects.toThrow();

      // The consumption must roll back with the failed persist.
      const remaining = await listUsableBattleItems({ database: db, }, actorId,);
      expect(remaining[0]?.quantity,).toBe(2,);
    } finally {
      sqlite.exec("DROP TRIGGER fail_battle_persist_tx;",);
    }
  });

  it("useBattleItem rejects unknown actors, targets, and items", async () => {
    const actorId = uid();
    await seedActor(db, createdBy, actorId,);
    await insertActorItems(db, actorId, "Healing Draught", "consumable" as never, {
      id: "dr-3",
      quantity: 1,
      metadata: healMeta(4,),
    },);

    const battle = await startBattle({ database: db, }, {
      chatId: uid(),
      createdBy,
      combatants: [makeCombatant(actorId, "Alice", false,),],
    },);

    await expect(useBattleItem({ database: db, }, {
      battleId: battle.id,
      actorId: "ghost",
      itemId: "dr-3",
    },),).rejects.toThrow("not in this battle",);

    await expect(useBattleItem({ database: db, }, {
      battleId: battle.id,
      actorId,
      targetId: "ghost",
      itemId: "dr-3",
    },),).rejects.toThrow("not in this battle",);

    await expect(useBattleItem({ database: db, }, {
      battleId: battle.id,
      actorId,
      itemId: "ghost item",
    },),).rejects.toThrow("No usable battle item",);
  });

  it("performSocialAction resolves a check and persists a log entry", async () => {
    const actorId = uid();
    await seedActor(db, createdBy, actorId,);
    const battle = await startBattle({ database: db, }, {
      chatId: uid(),
      createdBy,
      combatants: [makeCombatant(actorId, "Alice", false,), makeCombatant("orc", "Orc", true,),],
    },);

    const result = await performSocialAction({ database: db, }, {
      battleId: battle.id,
      action: "intimidate",
      actorId,
      targetId: "orc",
    },);

    expect(result.action,).toBe("intimidate",);
    expect(typeof result.success,).toBe("boolean",);
    expect(result.outcome.length,).toBeGreaterThan(0,);
    // Roster unchanged, log entry persisted.
    const reloaded = await getBattle({ database: db, }, battle.id,);
    expect(reloaded!.combatants.find((c,) => c.id === "orc")?.hp,).toBe(30,);
    expect(reloaded!.log.length,).toBeGreaterThan(battle.log.length,);
  });

  it("performSocialAction rejects targets outside the battle", async () => {
    const actorId = uid();
    await seedActor(db, createdBy, actorId,);
    const battle = await startBattle({ database: db, }, {
      chatId: uid(),
      createdBy,
      combatants: [makeCombatant(actorId, "Alice", false,),],
    },);

    await expect(performSocialAction({ database: db, }, {
      battleId: battle.id,
      action: "taunt",
      actorId,
      targetId: "ghost",
    },),).rejects.toThrow("not in this battle",);
  });
});
