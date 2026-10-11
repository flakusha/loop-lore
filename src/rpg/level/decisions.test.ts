// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/level/decisions.test.ts — level-up decisions + affinity allocation
 *
 * Pins: staging (question surface vs pending-only), auto-resolve for
 * autonomous actors vs human-pending, affinity weighting (top skill's
 * category, enemy physical skew), deterministic tie-breaks, ASI_MAX
 * capping of the auto loop, and explicit resolve choices.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import {
  insertActors,
  insertCharacterSkills,
  insertCharacterStats,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers.js";
import {
  autoAllocateAsi,
  autoResolveIfAutonomous,
  resolveLevelUpDecision,
  stageLevelUpDecision,
} from "./decisions.js";

let db: Kysely<DB>;
let ownerId: string;
let chatId: string;

beforeAll(async () => {
  db = (await createTestDb()).db;
  createLogger({ level: "error", },);
  ownerId = await insertUsers(db, "decide-owner", "Decide Owner",);
  chatId = await insertChats(db, "Decide Chat", ownerId,);
},);

async function seedActor(name: string, opts: {
  pendingAsi?: number;
  agentType?: "none" | "ai";
  alignment?: string;
  stats?: Record<string, number>;
} = {},): Promise<string> {
  const actorId = await insertActors(db, name, {
    user_id: ownerId,
    actor_type: "character",
    agent_type: opts.agentType ?? "none",
  },);

  await insertCharacterStats(db, actorId, 10, 10, 10, {
    pending_asi: opts.pendingAsi ?? 2,
    combat_alignment: opts.alignment ?? "player",
    ...opts.stats,
  },);

  return actorId;
}

async function rowOf(actorId: string,) {
  return db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).executeTakeFirstOrThrow();
}

describe("stageLevelUpDecision", () => {
  test("creates a level_up question when budget and chat are present", async () => {
    const actor = await seedActor("Staged",);
    const questionId = await stageLevelUpDecision(db, actor, chatId,);
    expect(questionId,).not.toBeNull();

    const q = await db.selectFrom("rpg_questions",).selectAll()
      .where("id", "=", questionId!,).executeTakeFirstOrThrow();

    expect(q.type,).toBe("level_up",);
    const options = JSON.parse(q.options,) as { id: string }[];
    expect(options.some((o,) => o.id === "asi:str+2"),).toBe(true,);
    expect(options.some((o,) => o.id === "asi:auto"),).toBe(true,);
  });

  test("returns null with no budget or no chat", async () => {
    const noBudget = await seedActor("No Budget", { pendingAsi: 0, },);
    expect(await stageLevelUpDecision(db, noBudget, chatId,),).toBeNull();

    const withBudget = await seedActor("No Chat",);
    expect(await stageLevelUpDecision(db, withBudget,),).toBeNull();
  });
});

describe("autoAllocateAsi affinity weighting", () => {
  test("top skill's category governs the first spend", async () => {
    const actor = await seedActor("Mage",);
    await insertCharacterSkills(db, actor, "Arcana", "magic", { xp: 500, },);
    await insertCharacterSkills(db, actor, "Swordplay", "combat", { xp: 100, },);

    const resolution = await autoAllocateAsi(db, actor,);
    expect(resolution.spends[0]!.ability,).toBe("int",); // magic → int
    expect(resolution.spends,).toHaveLength(2,);
    expect(resolution.remaining,).toBe(0,);
  });

  test("enemy combat alignment skews physical (str over cha)", async () => {
    const actor = await seedActor("Enemy Brute", {
      alignment: "enemy",
      stats: { cha: 15, }, // social would otherwise look attractive via canonical order
    },);

    await insertCharacterSkills(db, actor, "Schmoozing", "social", { xp: 300, },);

    const resolution = await autoAllocateAsi(db, actor,);
    // social→cha gets +2, but enemy skew gives str and con +2 each; str is
    // the canonical first among the tied leaders.
    expect(resolution.spends[0]!.ability,).toBe("str",);
  });

  test("equal weights resolve in canonical ability order", async () => {
    const actor = await seedActor("Tied",);
    const resolution = await autoAllocateAsi(db, actor,);
    // No skill, player alignment: all weights 0 → str first, then str again.
    expect(resolution.spends.map((s,) => s.ability),).toEqual(["str", "str",],);
  });

  test("stops at ASI_MAX and leaves the rest pending", async () => {
    const actor = await seedActor("Maxed Str", {
      pendingAsi: 2,
      stats: {
        str: 20,
        dex: 20,
        con: 20,
        int: 20,
        wis: 20, // only cha has room
      },
    },);

    const resolution = await autoAllocateAsi(db, actor,);
    expect(resolution.spends,).toHaveLength(2,);
    expect(resolution.spends.every((s,) => s.ability === "cha"),).toBe(true,);
    expect(resolution.remaining,).toBe(0,);
  });

  test("all-capped actors keep the budget pending", async () => {
    const actor = await seedActor("Stone", {
      pendingAsi: 1,
      stats: { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20, },
    },);

    const resolution = await autoAllocateAsi(db, actor,);
    expect(resolution.spends,).toHaveLength(0,);
    expect(resolution.remaining,).toBe(1,);
  });
});

describe("autonomous vs human resolution", () => {
  test("autonomous actor (agent_type ai) spends immediately", async () => {
    const actor = await seedActor("Autonomous", { agentType: "ai", },);
    await insertCharacterSkills(db, actor, "Stealth Training", "stealth", { xp: 400, },);

    const resolution = await autoResolveIfAutonomous(db, actor,);
    expect(resolution,).not.toBeNull();
    expect(resolution!.remaining,).toBe(0,);
    expect((await rowOf(actor,)).pending_asi,).toBe(0,);
  });

  test("human actor (agent_type none) keeps the budget pending", async () => {
    const actor = await seedActor("Human", { agentType: "none", },);
    const resolution = await autoResolveIfAutonomous(db, actor,);
    expect(resolution,).toBeNull();
    expect((await rowOf(actor,)).pending_asi,).toBe(2,);
  });
});

describe("resolveLevelUpDecision", () => {
  test("explicit asi choice spends on the requested ability", async () => {
    const actor = await seedActor("Chooser",);
    const resolution = await resolveLevelUpDecision(db, actor, { kind: "asi", ability: "wis", points: 2, },);
    expect(resolution.spends[0]!.ability,).toBe("wis",);
    expect(resolution.spends[0]!.granted,).toBe(2,);
    expect((await rowOf(actor,)).wis,).toBe(12,);
  });

  test("auto choice delegates to the affinity allocator", async () => {
    const actor = await seedActor("Delegator",);
    const resolution = await resolveLevelUpDecision(db, actor, { kind: "auto", },);
    expect(resolution.spends,).toHaveLength(2,);
    expect(resolution.remaining,).toBe(0,);
  });

  test("no choice resolves automatically", async () => {
    const actor = await seedActor("No Opinion",);
    const resolution = await resolveLevelUpDecision(db, actor,);
    expect(resolution.spends,).toHaveLength(2,);
  });
});
