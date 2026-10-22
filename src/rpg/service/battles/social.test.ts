// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `performSocialAction` tests: guard branches, every verb's surfaced
 * outcome, and the persisted battle-log side effect.
 *
 * Resource contract: every test owns a fresh in-memory SQLite DB
 * (`createTestDb` in `beforeEach`, destroyed in `afterEach` — deterministic
 * teardown even on failure) plus its own randomly generated battle/actor
 * ids, so tests never collide and never depend on order. No fs paths, no
 * ports, no shared mutable globals — dice are never pinned; the negotiate
 * test verifies the reported roll against d20 rules for any outcome.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { RelationshipType, } from "../../../db/enums-character/relationships.js";
import type { DB, } from "../../../db/schema.js";
import { createLogger, } from "../../../logger/index.js";
import { ActionType, type Combatant, } from "../../../rpg/combat.js";
import type { StatBlock, } from "../../../rpg/stats.js";
import {
  createTestDb,
  destroyTestDb,
  type TestDb,
} from "../../../test-utils/create-test-db.js";
import {
  insertActors,
  insertBattles,
  insertCharacterRelationships,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers.js";
import { uid, } from "../../../utils.js";
import { getBattle, } from "./persistence.js";
import { performSocialAction, } from "./social.js";
import { BattleStatus, buildCombatant, } from "./types.js";

createLogger({ level: "error", },);

let fixture: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

const BASE_STATS: StatBlock = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };

/** Build a roster combatant; overrides shape the deterministic check math. */
function combatant(
  id: string,
  name: string,
  overrides?: { hp?: number; level?: number; cha?: number; isNpc?: boolean },
): Combatant {
  const fighter = buildCombatant(
    id,
    name,
    { ...BASE_STATS, cha: overrides?.cha ?? BASE_STATS.cha, },
    overrides?.level ?? 5,
    overrides?.hp ?? 30,
    14,
    overrides?.isNpc ?? true,
  );

  return fighter;
}

/** Seed one battle row; returns its id. */
async function seedBattle(
  roster: Combatant[],
  opts?: { worldId?: string | null; status?: BattleStatus; round?: number; turnIndex?: number },
): Promise<string> {
  const battleId = uid();
  await insertBattles(db, uid(), "gm-user", {
    id: battleId,
    world_id: opts?.worldId ?? null,
    status: opts?.status ?? BattleStatus.Active,
    round: opts?.round,
    turn_index: opts?.turnIndex,
    combatants: JSON.stringify(roster,),
    log: "[]",
  },);

  return battleId;
}

/** Seed the two actor rows a relationship needs; ids double as combatant ids. */
async function seedActorPair(): Promise<{ targetId: string; actorId: string }> {
  const targetId = uid();
  const actorId = uid();
  await insertActors(db, "Orc Actor", { id: targetId, },);
  await insertActors(db, "Alice Actor", { id: actorId, },);
  return { targetId, actorId, };
}

describe("performSocialAction", () => {
  test("rejects a battle id that does not exist", async () => {
    await expect(performSocialAction({ database: db, }, {
      battleId: "missing-battle",
      action: "taunt",
      actorId: "alice",
      targetId: "orc",
    },),).rejects.toThrow("Battle missing-battle not found.",);
  });

  test("rejects a battle that is no longer active", async () => {
    const battleId = await seedBattle([combatant("alice", "Alice", { isNpc: false, },), combatant("orc", "Orc",),], {
      status: BattleStatus.Completed,
    },);

    await expect(performSocialAction({ database: db, }, {
      battleId,
      action: "taunt",
      actorId: "alice",
      targetId: "orc",
    },),).rejects.toThrow(`Battle ${battleId} is completed, not active.`,);
  });

  test("rejects an actor outside the battle", async () => {
    const battleId = await seedBattle([combatant("orc", "Orc",),],);

    await expect(performSocialAction({ database: db, }, {
      battleId,
      action: "intimidate",
      actorId: "ghost",
      targetId: "orc",
    },),).rejects.toThrow("Actor ghost is not in this battle.",);
  });

  test("rejects a defeated actor", async () => {
    const battleId = await seedBattle([
      combatant("alice", "Alice", { hp: 0, isNpc: false, },),
      combatant("orc", "Orc",),
    ],);

    await expect(performSocialAction({ database: db, }, {
      battleId,
      action: "intimidate",
      actorId: "alice",
      targetId: "orc",
    },),).rejects.toThrow("Alice is defeated and cannot act.",);
  });

  test("rejects a target outside the battle", async () => {
    const battleId = await seedBattle([combatant("alice", "Alice", { isNpc: false, },),],);

    await expect(performSocialAction({ database: db, }, {
      battleId,
      action: "intimidate",
      actorId: "alice",
      targetId: "ghost",
    },),).rejects.toThrow("Target ghost is not in this battle.",);
  });

  test("rejects a defeated target", async () => {
    const battleId = await seedBattle([
      combatant("alice", "Alice", { isNpc: false, },),
      combatant("orc", "Orc", { hp: 0, },),
    ],);

    await expect(performSocialAction({ database: db, }, {
      battleId,
      action: "intimidate",
      actorId: "alice",
      targetId: "orc",
    },),).rejects.toThrow("Orc is already defeated.",);
  });

  test("intimidate failure surfaces the calculator narrative verbatim", async () => {
    // cha 10 + level 5 * 2 = 20 vs resistance 75 (default morale 50) → margin -63.
    const battleId = await seedBattle([
      combatant("alice", "Alice", { cha: 10, level: 5, isNpc: false, },),
      combatant("orc", "Orc",),
    ],);

    const result = await performSocialAction({ database: db, }, {
      battleId,
      action: "intimidate",
      actorId: "alice",
      targetId: "orc",
    },);

    expect(result.action,).toBe("intimidate",);
    expect(result.success,).toBe(false,);
    expect(result.outcome,).toBe("Intimidation failed! Target stands firm.",);
    expect(result.surrenderChance,).toBeUndefined();
    expect(result.canSurrender,).toBeUndefined();
    expect(result.battleId,).toBe(battleId,);
    expect(result.actor.id,).toBe("alice",);
    expect(result.target.id,).toBe("orc",);
  });

  test("intimidate success reports the morale drop and appends a FreeAction log entry", async () => {
    // cha 18 + level 30 * 2 = 78 vs resistance 75 → margin 3, morale -1.5.
    const battleId = await seedBattle([
      combatant("alice", "Alice", { cha: 18, level: 30, isNpc: false, },),
      combatant("orc", "Orc",),
    ], { round: 2, turnIndex: 1, },);

    const result = await performSocialAction({ database: db, }, {
      battleId,
      action: "intimidate",
      actorId: "alice",
      targetId: "orc",
    },);

    expect(result.success,).toBe(true,);
    expect(result.outcome,).toBe("Intimidation successful! Target's morale drops by 1.5.",);

    const reloaded = await getBattle({ database: db, }, battleId,);
    expect(reloaded,).not.toBeNull();
    // Roster unchanged, battle stays active at the same round/turn.
    expect(reloaded!.status,).toBe(BattleStatus.Active,);
    expect(reloaded!.round,).toBe(2,);
    expect(reloaded!.turnIndex,).toBe(1,);
    expect(reloaded!.combatants.find((c,) => c.id === "orc")?.hp,).toBe(30,);
    expect(reloaded!.log,).toHaveLength(1,);
    const entry = reloaded!.log[0]!;
    expect(entry.type,).toBe(ActionType.FreeAction,);
    expect(entry.actorId,).toBe("alice",);
    expect(entry.targetId,).toBe("orc",);
    expect(entry.description,).toBe(
      "Alice (intimidate → Orc): Intimidation successful! Target's morale drops by 1.5.",
    );
  });

  test("taunt fails against neutral personality below the resistance floor", async () => {
    // cha 10 vs neutral resistance 50 → margin -40.
    const battleId = await seedBattle([
      combatant("alice", "Alice", { cha: 10, isNpc: false, },),
      combatant("orc", "Orc",),
    ],);

    const result = await performSocialAction({ database: db, }, {
      battleId,
      action: "taunt",
      actorId: "alice",
      targetId: "orc",
    },);

    expect(result.success,).toBe(false,);
    expect(result.outcome,).toBe("Taunt failed! Target remains composed.",);
  });

  test("taunt succeeds when charisma exceeds the neutral resistance", async () => {
    // cha 60 vs neutral resistance 50 → margin 10.
    const battleId = await seedBattle([
      combatant("alice", "Alice", { cha: 60, isNpc: false, },),
      combatant("orc", "Orc",),
    ],);

    const result = await performSocialAction({ database: db, }, {
      battleId,
      action: "taunt",
      actorId: "alice",
      targetId: "orc",
    },);

    expect(result.success,).toBe(true,);
    expect(result.outcome,).toBe("Taunt successful! Target becomes reckless.",);
  });

  test("negotiate runs a charisma check against the medium DC and reports it honestly", async () => {
    // cha 10 → +0 modifier; a plain d20 against STANDARD_DC.medium (15).
    const battleId = await seedBattle([
      combatant("alice", "Alice", { cha: 10, isNpc: false, },),
      combatant("orc", "Orc",),
    ],);

    const result = await performSocialAction({ database: db, }, {
      battleId,
      action: "negotiate",
      actorId: "alice",
      targetId: "orc",
    },);

    // The surfaced outcome must carry the rolled die and the DC it used.
    const match = /^(Critical success|Success|Critical failure|Failure)! Roll: (\d+) vs DC 15$/.exec(
      result.outcome,
    );

    expect(match,).not.toBeNull();
    const verdict = match![1]!;
    const roll = Number(match![2],);

    // Verdict and success flag must agree with the reported die under d20 rules.
    expect(verdict,).toBe(
      roll === 20
        ? "Critical success"
        : roll === 1
        ? "Critical failure"
        : roll >= 15
        ? "Success"
        : "Failure",
    );

    expect(result.success,).toBe(roll === 20 || (roll !== 1 && roll >= 15),);
  });

  test("surrender refuses while the default morale stands (no relationship row)", async () => {
    const battleId = await seedBattle([
      combatant("alice", "Alice", { isNpc: false, },),
      combatant("orc", "Orc",),
    ],);

    const result = await performSocialAction({ database: db, }, {
      battleId,
      action: "surrender",
      actorId: "alice",
      targetId: "orc",
    },);

    // Default morale (50) is above the 30 gate, so surrender is never viable.
    expect(result.success,).toBe(false,);
    expect(result.canSurrender,).toBe(false,);
    expect(result.surrenderChance,).toBe(0,);
    expect(result.outcome,).toBe(
      "Orc refuses to surrender (morale too high or no viable chance).",
    );
  });

  test("surrender reads standing without a world scope", async () => {
    const { targetId, actorId, } = await seedActorPair();
    const battleId = await seedBattle([
      combatant(actorId, "Alice", { isNpc: false, },),
      combatant(targetId, "Orc",),
    ],);

    await insertCharacterRelationships(
      db,
      targetId,
      actorId,
      RelationshipType.Rival,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      {
        standing: -100,
        world_id: null,
      },
    );

    const result = await performSocialAction({ database: db, }, {
      battleId,
      action: "surrender",
      actorId,
      targetId,
    },);

    expect(result.success,).toBe(false,);
    expect(result.canSurrender,).toBe(false,);
    expect(result.outcome,).toBe(
      "Orc refuses to surrender (morale too high or no viable chance).",
    );
  });

  test("surrender reads standing scoped to the battle's world", async () => {
    await insertUsers(db, "gm", "Game Master", { id: "gm-user", },);
    const worldId = uid();
    await insertWorlds(db, "gm-user", "Battle World", { id: worldId, },);

    const { targetId, actorId, } = await seedActorPair();
    const battleId = await seedBattle([
      combatant(actorId, "Alice", { isNpc: false, },),
      combatant(targetId, "Orc",),
    ], { worldId, },);

    // Standing exists only in another world — the world-scoped read misses it.
    const otherWorldId = uid();
    await insertWorlds(db, "gm-user", "Other World", { id: otherWorldId, },);
    await insertCharacterRelationships(
      db,
      targetId,
      actorId,
      RelationshipType.Rival,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      {
        standing: -100,
        world_id: otherWorldId,
      },
    );

    const result = await performSocialAction({ database: db, }, {
      battleId,
      action: "surrender",
      actorId,
      targetId,
    },);

    expect(result.success,).toBe(false,);
    expect(result.canSurrender,).toBe(false,);
    expect(result.outcome,).toBe(
      "Orc refuses to surrender (morale too high or no viable chance).",
    );
  });
});
