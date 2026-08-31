// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battles Service Tests
 *
 * Exercises the durable per-chat encounter service over a real test DB:
 * start/get/attack/heal/turn-advance/end, roster JSON round-tripping, and
 * the active-battle exclusivity guard.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import type { Combatant, } from "../../rpg/combat.js";
import type { StatBlock, } from "../../rpg/stats.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { insertUsers, } from "../../test-utils/insert-helpers.js";
import { uid, } from "../../utils.js";
import {
  advanceTurn,
  buildCombatant,
  endBattle,
  getActiveBattle,
  getBattle,
  performAttack,
  performHeal,
  type ResolvedAttack,
  startBattle,
} from "./battles.js";

const stats: StatBlock = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 6, };

/**
 * @param id
 * @param name
 * @param isNpc
 * @param hp
 */
function makeCombatant(id: string, name: string, isNpc: boolean, hp = 30,): Combatant {
  return buildCombatant(id, name, stats, 5, hp, 16, isNpc,);
}

describe("battles service", () => {
  let db: Kysely<DB>;
  let createdBy: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    createdBy = uid();
    await insertUsers(
      db,
      `user-${createdBy}`,
      "Battle Master",
      { id: createdBy, role: "solo", status: "active", settings: "{}", } as never,
    );
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  it("startBattle rolls initiative and persists the roster", async () => {
    const chatId = uid();
    const battle = await startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [makeCombatant("alice", "Alice", false,), makeCombatant("orc", "Orc", true, 20,),],
    },);

    expect(battle.id,).toBeDefined();
    expect(battle.status,).toBe("active",);
    expect(battle.round,).toBe(1,);
    expect(battle.turnIndex,).toBe(0,);
    expect(battle.combatants,).toHaveLength(2,);
    expect(battle.combatants[0]?.initiative,).toBeGreaterThanOrEqual(1,);
    expect(battle.log,).toEqual([],);

    // Reload from DB — roster must round-trip through the JSON column.
    const reloaded = await getBattle({ database: db, }, battle.id,);
    expect(reloaded,).not.toBeNull();
    expect(reloaded!.combatants,).toHaveLength(2,);
    const names = Array.from(reloaded!.combatants, (c,) => c.name,).sort((a, b,) => a.localeCompare(b,));
    expect(names,).toEqual(["Alice", "Orc",],);
  });

  it("rejects a second active battle for the same chat", async () => {
    const chatId = uid();
    await startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [makeCombatant("a", "A", false,),],
    },);
    await expect(startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [makeCombatant("b", "B", false,),],
    },),).rejects.toThrow("already exists",);
  });

  it("getActiveBattle returns null when no battle is active", async () => {
    const chatId = uid();
    const none = await getActiveBattle({ database: db, }, chatId,);
    expect(none,).toBeNull();
  });

  it("performAttack applies damage and persists it", async () => {
    const chatId = uid();
    const battle = await startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [makeCombatant("alice", "Alice", false, 30,), makeCombatant("orc", "Orc", true, 30,),],
    },);

    const result = await performAttack({ database: db, }, {
      battleId: battle.id,
      attackerId: "alice",
      targetId: "orc",
      attackAbility: "str",
      damageDice: 1,
      damageSides: 8,
    },);

    expect(result.over,).toBe(false,);
    const orc = result.combatants.find((c,) => c.id === "orc");
    // A hit reduces HP, a miss leaves it — either way it stays in range and
    // a 1d8 cannot drop a 30-HP target, so the battle is not over.
    expect(orc!.hp,).toBeGreaterThanOrEqual(0,);
    expect(orc!.hp,).toBeLessThanOrEqual(30,);

    // Persisted roster reflects the damage.
    const reloaded = await getBattle({ database: db, }, battle.id,);
    const reloadedOrc = reloaded!.combatants.find((c,) => c.id === "orc");
    expect(reloadedOrc!.hp,).toBe(orc!.hp,);
    expect(reloaded!.log,).toHaveLength(1,);
  });

  it("performAttack errors when attacker or target is not in the roster", async () => {
    const chatId = uid();
    const battle = await startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [makeCombatant("alice", "Alice", false,),],
    },);

    await expect(performAttack({ database: db, }, {
      battleId: battle.id,
      attackerId: "ghost",
      targetId: "alice",
      attackAbility: "str",
      damageDice: 1,
      damageSides: 6,
    },),).rejects.toThrow(/not in this battle/,);
  });

  it("performHeal restores HP up to max and persists", async () => {
    const chatId = uid();
    // Hand-built combatant with hp < maxHp (buildCombatant starts at full).
    const wounded: Combatant = {
      ...makeCombatant("alice", "Alice", false, 30,),
      hp: 10,
    };
    const battle = await startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [wounded,],
    },);

    const healed = await performHeal({ database: db, }, {
      battleId: battle.id,
      targetId: "alice",
      amount: 15,
    },);

    expect(healed.healed,).toBe(15,);
    expect(healed.combatant.hp,).toBe(25,);

    // Healing beyond max clamps to max HP.
    const clamped = await performHeal({ database: db, }, {
      battleId: battle.id,
      targetId: "alice",
      amount: 100,
    },);
    expect(clamped.healed,).toBe(5,);
    expect(clamped.combatant.hp,).toBe(30,);

    const reloaded = await getBattle({ database: db, }, battle.id,);
    expect(reloaded!.combatants[0]!.hp,).toBe(30,);
  });

  it("advanceTurn rolls to round 2 when the roster ends", async () => {
    const chatId = uid();
    const battle = await startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [makeCombatant("alice", "Alice", false,), makeCombatant("orc", "Orc", true,),],
    },);

    const advanced = await advanceTurn({ database: db, }, battle.id,);
    // Two combatants: turn 0 -> turn 1 stays round 1.
    expect(advanced.round,).toBe(1,);
    expect(advanced.turnIndex,).toBe(1,);

    const advanced2 = await advanceTurn({ database: db, }, advanced.id,);
    expect(advanced2.round,).toBe(2,);
    expect(advanced2.turnIndex,).toBe(0,);
  });

  it("endBattle marks the battle abandoned with ended_at", async () => {
    const chatId = uid();
    const battle = await startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [makeCombatant("alice", "Alice", false,),],
    },);

    await endBattle({ database: db, }, battle.id, "abandoned",);

    const ended = await getBattle({ database: db, }, battle.id,);
    expect(ended!.status,).toBe("abandoned",);
    expect(ended!.endedAt,).not.toBeNull();

    const active = await getActiveBattle({ database: db, }, chatId,);
    expect(active,).toBeNull();
  });

  it("attacking past an enemy's HP completes the battle with a player win", async () => {
    const chatId = uid();
    // Player (AC 16) vs enemy (AC 0) so the attack always hits.
    const player = buildCombatant("alice", "Alice", stats, 5, 30, 16, false,);
    const enemy = buildCombatant("orc", "Orc", stats, 5, 1, 0, true,);
    const battle = await startBattle({ database: db, }, {
      chatId,
      createdBy,
      combatants: [player, enemy,],
    },);

    // Retry on the rare natural-1 critical miss; a hit always kills the
    // 1-HP enemy (d6 + 3 STR + 10 ≥ 14 damage vs AC 0). 5 retries makes a
    // persistent miss effectively impossible (0.05^5).
    let result: ResolvedAttack | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await performAttack({ database: db, }, {
        battleId: battle.id,
        attackerId: "alice",
        targetId: "orc",
        attackAbility: "str",
        damageDice: 1,
        damageSides: 6,
        extraDamage: 10,
      },);
      result = r;
      if (r.over) { break; }
    }

    expect(result!.over,).toBe(true,);
    expect(result!.winner,).toBe("player",);

    // Battle persisted as completed (no longer active).
    const reloaded = await getBattle({ database: db, }, battle.id,);
    expect(reloaded!.status,).toBe("completed",);
    expect(reloaded!.endedAt,).not.toBeNull();
    const active = await getActiveBattle({ database: db, }, chatId,);
    expect(active,).toBeNull();
  });
});
