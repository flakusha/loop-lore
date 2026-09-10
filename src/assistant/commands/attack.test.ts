// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import type { Combatant, } from "../../rpg/combat";
import { BattleStatus, buildCombatant, } from "../../rpg/service/battles";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertBattles, insertUsers, } from "../../test-utils/insert-helpers";
import { type CommandContext, getCommand, } from "./registry";
import "./attack";

describe("attack command preconditions", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = crypto.randomUUID();
    await insertUsers(db, `attack-pre-${userId}`, "Attack Pre", { id: userId, } as never,);
    worldId = crypto.randomUUID();
    await db.insertInto("worlds",).values({
      id: worldId,
      name: "Arena",
      owner_id: userId,
      rpg_enabled: 1,
      rpg_dice: 1,
      rpg_checks: 1,
      rpg_combat: 1,
      rpg_xp: 1,
      rpg_loot: 1,
      rpg_quests: 1,
    },).execute();
  },);

  function ctx(overrides: Partial<CommandContext> = {},): CommandContext {
    return {
      chatId: crypto.randomUUID(),
      activeChat: { id: "chat", worldId, },
      db,
      userId,
      ...overrides,
    };
  }

  test("fails without a database handle", async () => {
    const handler = getCommand("attack",)!;
    const result = await handler(["Orc",], ctx({ db: undefined, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("missing database",);
  });

  test("fails without a user context", async () => {
    const handler = getCommand("attack",)!;
    const result = await handler(["Orc",], ctx({ userId: undefined, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("missing user context",);
  });

  test("shows usage without a target", async () => {
    const handler = getCommand("attack",)!;
    const result = await handler([], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toStartWith("Usage:",);
  });

  test("refuses to attack outside a battle", async () => {
    const handler = getCommand("attack",)!;
    const result = await handler(["Orc",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no active battle",);
  });
  /** Build a combatant serialized the way startBattle persists it. */
  function makeCombatant(id: string, name: string, hp: number, isNpc: boolean,): Combatant {
    const combatant = buildCombatant(
      id,
      name,
      { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, },
      3,
      hp,
      12,
      isNpc,
    );
    combatant.hp = hp;
    return combatant;
  }

  /**
   * @param chatId
   * @param combatants
   */
  async function seedBattle(chatId: string, combatants: Combatant[],): Promise<void> {
    await insertBattles(db, chatId, userId, {
      id: crypto.randomUUID(),
      world_id: worldId,
      status: BattleStatus.Active,
      combatants: JSON.stringify(combatants,),
      log: "[]",
    } as never,);
  }

  test("reports a battle with no combatants to act with", async () => {
    const chatId = crypto.randomUUID();
    await seedBattle(chatId, [],);
    const handler = getCommand("attack",)!;
    const result = await handler(["Orc",], ctx({ chatId, activeChat: { id: chatId, worldId, }, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no combatants",);
  });

  test("lists the roster when the target does not match", async () => {
    const chatId = crypto.randomUUID();
    await seedBattle(chatId, [makeCombatant("hero-1", "Hero", 20, false,), makeCombatant("e-1", "Orc", 8, true,),],);
    const handler = getCommand("attack",)!;
    const result = await handler(["Dragon",], ctx({ chatId, activeChat: { id: chatId, worldId, }, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain('target "Dragon" not found',);
    expect(result.systemMessage,).toContain("Orc",);
  });
});
