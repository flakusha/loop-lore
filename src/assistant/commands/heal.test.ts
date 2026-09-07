// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /heal command tests — argument validation, roster resolution, and the
 * durable heal path against an in-memory battle row.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import type { Combatant, } from "../../rpg/combat";
import { BattleStatus, buildCombatant, } from "../../rpg/service/battles";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertBattles, } from "../../test-utils/insert-helpers";
import "./heal";
import { type CommandContext, type CommandResult, getCommand, getCommandRequirement, } from "./registry";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  const testDb = await createTestDb();
  db = testDb.db;
},);

/** Resolve the registered /heal handler. */
function healHandler(): (args: string[], ctx: CommandContext,) => Promise<CommandResult> {
  const handler = getCommand("heal",);
  if (!handler) { throw new Error("/heal not registered",); }
  return handler as (args: string[], ctx: CommandContext,) => Promise<CommandResult>;
}

/** Build a combatant serialized the way startBattle persists it. */
function makeCombatant(id: string, name: string, hp: number, maxHp: number,): Combatant {
  const combatant = buildCombatant(
    id,
    name,
    { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, },
    3,
    maxHp,
    12,
    false,
  );
  combatant.hp = hp;
  return combatant;
}

/** Seed one active battle in a fresh chat; returns both ids. */
let chatSeq = 0;
async function seedBattle(
  combatants: Combatant[],
  rawCombatants?: string,
): Promise<{ chatId: string; battleId: string }> {
  const chatId = `chat-${++chatSeq}`;
  const battleId = crypto.randomUUID();
  await insertBattles(db, chatId, "gm-user", {
    id: battleId,
    status: BattleStatus.Active,
    combatants: rawCombatants ?? JSON.stringify(combatants,),
    log: "[]",
  } as never,);
  return { chatId, battleId, };
}

function ctxFor(chatId: string, overrides?: Partial<CommandContext>,): CommandContext {
  return { chatId, db, userId: "gm-user", ...overrides, };
}

describe("/heal", () => {
  it("is owner-gated", () => {
    expect(getCommandRequirement("heal",),).toBeDefined();
  });

  it("reports a missing database context", async () => {
    const result = await healHandler()([], ctxFor("c1", { db: undefined, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Heal unavailable:** command context missing database.",);
  });

  it("reports a missing user context", async () => {
    const result = await healHandler()([], ctxFor("c1", { userId: undefined, },),);
    expect(result.systemMessage,).toContain("**Heal unavailable:** missing user context.",);
  });

  it("returns usage when the target is omitted", async () => {
    const result = await healHandler()([], ctxFor("c1",),);
    expect(result.systemMessage,).toContain("Usage: `/heal <target> [amount]`",);
    expect(result.action,).toBeUndefined();
  });

  it("reports when no battle is active in the chat", async () => {
    const result = await healHandler()(["Orc",], ctxFor("empty-chat",),);
    expect(result.systemMessage,).toContain("no active battle in this chat",);
  });

  it("lists the roster when the target does not match", async () => {
    const { chatId, } = await seedBattle(
      [makeCombatant("e1", "Goblin", 5, 10,), makeCombatant("e2", "Orc", 8, 20,),],
    );
    const result = await healHandler()(["troll",], ctxFor(chatId,),);
    expect(result.systemMessage,).toContain('target "troll" not found',);
    expect(result.systemMessage,).toContain("Goblin, Orc",);
  });

  it("treats a corrupted roster as an empty one", async () => {
    // Valid JSON that is not an array — the persistence layer must fall back.
    const { chatId, } = await seedBattle([], '"corrupted-roster"',);
    const result = await healHandler()(["Orc",], ctxFor(chatId,),);
    expect(result.systemMessage,).toContain('target "Orc" not found',);
    expect(result.systemMessage,).toContain("Roster: none",);
  });

  it("refuses to heal a combatant already at full HP", async () => {
    const { chatId, } = await seedBattle([makeCombatant("e1", "Orc", 20, 20,),],);
    const result = await healHandler()(["Orc",], ctxFor(chatId,),);
    expect(result.systemMessage,).toContain("already at full HP",);
  });

  it("rejects a zero amount", async () => {
    const { chatId, } = await seedBattle([makeCombatant("e1", "Orc", 10, 20,),],);
    const result = await healHandler()(["Orc", "0",], ctxFor(chatId,),);
    expect(result.systemMessage,).toContain("amount must be a positive number",);
  });

  it("defaults to a full heal when the amount is not numeric", async () => {
    const { chatId, battleId, } = await seedBattle([makeCombatant("e1", "Orc", 10, 20,),],);
    const result = await healHandler()(["Orc", "lots",], ctxFor(chatId,),);
    expect(result.action,).toBe("battle-updated",);
    expect(result.actionPayload,).toEqual({ battleId, },);
    expect(result.systemMessage,).toContain("healed for **10 HP** (20/20)",);

    const row = await db.selectFrom("battles",).selectAll().where("id", "=", battleId,).executeTakeFirstOrThrow();
    const persisted = JSON.parse(row.combatants,) as Combatant[];
    expect(persisted[0]?.hp,).toBe(20,);
  });

  it("heals a partial amount and persists the new HP", async () => {
    const { chatId, battleId, } = await seedBattle([makeCombatant("e1", "Orc", 10, 30,),],);
    const result = await healHandler()(["orc", "5",], ctxFor(chatId,),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Orc** healed for **5 HP** (15/30)",);
    expect(result.action,).toBe("battle-updated",);

    const row = await db.selectFrom("battles",).selectAll().where("id", "=", battleId,).executeTakeFirstOrThrow();
    const persisted = JSON.parse(row.combatants,) as Combatant[];
    expect(persisted[0]?.hp,).toBe(15,);
  });

  it("matches targets case-insensitively by name substring", async () => {
    const { chatId, } = await seedBattle([makeCombatant("e1", "Goblin Chief", 4, 12,),],);
    const result = await healHandler()(["chief", "3",], ctxFor(chatId,),);
    expect(result.systemMessage,).toContain("**Goblin Chief** healed for **3 HP** (7/12)",);
  });
});
