// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/service/battles-rewards.test.ts — the battle victory XP leg
 *
 * Covers the LevelService grant per surviving participant (CR from the
 * fallen NPC's level, party-size split), the battle-id dedupe, the empty
 * short-circuits, and the performAttack hook that fires the leg when a
 * battle resolves with the player side standing.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import type { Combatant, } from "../../rpg/combat.js";
import type { StatBlock, } from "../../rpg/stats.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers.js";
import { performAttack, startBattle, } from "./battles.js";
import { applyVictoryXpLeg, } from "./battles/rewards.js";
import { buildCombatant, } from "./battles/types.js";

let db: Kysely<DB>;
let ownerId: string;

const stats: StatBlock = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 6, };

beforeAll(async () => {
  db = (await createTestDb()).db;
  createLogger({ level: "error", },);
  ownerId = await insertUsers(db, "rewards-owner", "Rewards Owner",);
},);

/** Seed an actor id so character_stats FKs resolve. */
async function seedActor(name: string,): Promise<string> {
  return insertActors(db, name, { user_id: ownerId, actor_type: "character", },);
}

/** Combatant with a controllable level (the CR proxy for XP math). */
function combatant(id: string, name: string, opts: {
  isNpc?: boolean;
  hp?: number;
  level?: number;
} = {},): Combatant {
  return buildCombatant(id, name, stats, opts.level ?? 5, opts.hp ?? 30, 12, opts.isNpc ?? false,);
}

async function ledgerFor(actorId: string,) {
  return db.selectFrom("xp_ledger",).selectAll().where("actor_id", "=", actorId,).execute();
}

async function statsFor(actorId: string,) {
  return db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).executeTakeFirstOrThrow();
}

describe("applyVictoryXpLeg", () => {
  test("one combat ledger row per survivor, party-size split, battle-id reference", async () => {
    const heroA = await seedActor("Hero A",);
    const heroB = await seedActor("Hero B",);
    const ctx = {
      battleId: "battle-split",
      chatId: "chat-1",
      combatants: [
        combatant(heroA, "Hero A", { hp: 10, },),
        combatant(heroB, "Hero B", { hp: 5, },),
        combatant("foe-1", "Goblin Boss", { isNpc: true, hp: 0, level: 1, },),
      ],
    };

    await applyVictoryXpLeg(db, ctx,);

    // CR 1 → 200 XP split across 2 survivors → 100 each.
    for (const hero of [heroA, heroB,]) {
      const rows = await ledgerFor(hero,);
      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.source,).toBe("combat",);
      expect(rows[0]!.reference_id,).toBe("battle-split",);
      expect(rows[0]!.chat_id,).toBe("chat-1",);
      expect(rows[0]!.amount,).toBe(100,);
    }
  });

  test("multiple fallen foes sum into the single per-participant award", async () => {
    const hero = await seedActor("Hero Solo",);
    await applyVictoryXpLeg(db, {
      battleId: "battle-multi",
      chatId: "chat-1",
      combatants: [
        combatant(hero, "Hero Solo", { hp: 10, },),
        combatant("foe-a", "CR 1", { isNpc: true, hp: 0, level: 1, },),
        combatant("foe-b", "CR 2", { isNpc: true, hp: 0, level: 2, },),
      ],
    },);

    const rows = await ledgerFor(hero,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(200 + 450,); // CR 1 + CR 2, party of 1
  });

  test("a replayed victory dedupes on the battle id", async () => {
    const hero = await seedActor("Hero Replay",);
    const ctx = {
      battleId: "battle-replay",
      chatId: "chat-1",
      combatants: [combatant(hero, "Hero Replay",), combatant("foe", "Orc", { isNpc: true, hp: 0, level: 5, },),],
    };

    await applyVictoryXpLeg(db, ctx,);
    await applyVictoryXpLeg(db, ctx,);

    expect(await ledgerFor(hero,),).toHaveLength(1,);
    expect((await statsFor(hero,)).xp,).toBe(1800,); // CR 5 once, not twice
  });

  test("no fallen foes or no survivors grants nothing", async () => {
    const hero = await seedActor("Hero Idle",);

    await applyVictoryXpLeg(db, {
      battleId: "battle-empty",
      chatId: "chat-1",
      combatants: [combatant(hero, "Hero Idle",), combatant("foe", "Alive Orc", { isNpc: true, hp: 10, },),],
    },);

    await applyVictoryXpLeg(db, {
      battleId: "battle-wipe",
      chatId: "chat-1",
      combatants: [
        combatant(hero, "Hero Idle", { hp: 0, },),
        combatant("foe", "Orc", { isNpc: true, hp: 0, level: 5, },),
      ],
    },);

    expect(await ledgerFor(hero,),).toHaveLength(0,);
    expect(await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", hero,).execute(),).toHaveLength(
      0,
    );
  });

  test("a survivor without a stats row is bootstrapped by the pipeline", async () => {
    const fresh = await seedActor("Fresh Survivor",);
    await applyVictoryXpLeg(db, {
      battleId: "battle-fresh",
      chatId: "chat-1",
      combatants: [combatant(fresh, "Fresh Survivor",), combatant("foe", "Rat", { isNpc: true, hp: 0, level: 0, },),],
    },);

    const row = await statsFor(fresh,);
    expect(row.xp,).toBe(10,); // CR 0 → 10 XP
    expect(row.level,).toBe(1,);
  });
});

describe("performAttack victory hook", () => {
  test("resolving a battle through an attack grants victory XP", async () => {
    const hero = await seedActor("Hook Hero",);
    const battle = await startBattle({ database: db, }, {
      chatId: "chat-hook",
      createdBy: hero,
      combatants: [
        combatant(hero, "Hook Hero", { hp: 100, level: 20, },),
        combatant("hook-foe", "Paper Orc", { isNpc: true, hp: 1, level: 1, },),
      ],
    },);

    // Sure-hit stats: a d20+20 vs AC 12 only misses on natural 1s; bound the
    // loop anyway so a streak of misses cannot hang the suite.
    let resolved = null;
    for (let i = 0; i < 40 && !resolved; i++) {
      const attempt = await performAttack({ database: db, }, {
        battleId: battle.id,
        attackerId: hero,
        targetId: "hook-foe",
        attackAbility: "str",
        damageDice: 4,
        damageSides: 100,
        damageType: "physical",
      },);

      if (attempt.over) { resolved = attempt; }
    }

    expect(resolved,).not.toBeNull();
    expect(resolved!.winner,).toBe("player",);

    const rows = await ledgerFor(hero,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.source,).toBe("combat",);
    expect(rows[0]!.reference_id,).toBe(battle.id,);
    expect(rows[0]!.amount,).toBe(200,); // CR 1 foe, party of 1
  });
});
