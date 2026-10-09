// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/battle use` + `/battle social` handler tests over a real test DB:
 * precondition messages, happy-path action payloads, and target resolution.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import type { Combatant, } from "../../rpg/combat";
import {
  BattleStatus,
  buildCombatant,
  getActiveBattle,
  listUsableBattleItems,
  startBattle,
} from "../../rpg/service/battles";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { handleBattleSocial, handleBattleUse, } from "./battle-actions";
import type { CommandContext, } from "./registry";

const stats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };

/** Metadata JSON encoding an on-use heal effect. */
const healMeta = (amount: number,): string =>
  JSON.stringify({ effects: [{ kind: "on_use", action: "heal", payload: { amount, }, },], },);

/** Build a combatant the way startBattle persists it. */
function makeCombatant(id: string, name: string, hp: number, isNpc: boolean,): Combatant {
  return buildCombatant(id, name, stats, 1, hp, 10, isNpc,);
}

describe("battle use/social commands", () => {
  let db: Kysely<DB>;
  let userId: string;
  let actorId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(db, `use-${userId}`, "Commander", { id: userId, } as never,);
    const worldId = uid();
    await insertWorlds(db, userId, "Arena", { id: worldId, } as never,);
    actorId = uid();
    await insertActors(db, "Fighter", { id: actorId, user_id: userId, } as never,);
    await insertItems(db, worldId, "Healing Draught", "consumable", {} as never,);
    await insertActorItems(db, actorId, "Healing Draught", "consumable" as never, {
      id: "dr-x",
      quantity: 2,
      metadata: healMeta(6,),
    },);

    chatId = uid();
  },);

  function ctx(overrides: Partial<CommandContext> = {},): CommandContext {
    return { chatId, activeChat: { id: "chat", }, db, userId, ...overrides, } as CommandContext;
  }

  test("use reports missing database", async () => {
    const result = await handleBattleUse([], ctx({ db: undefined, },),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("missing database",);
  });

  test("use reports no active battle", async () => {
    const result = await handleBattleUse(["draught",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no active encounter",);
  });

  test("use lists usable items when nothing matches", async () => {
    await startBattle({ database: db, }, {
      chatId,
      createdBy: userId,
      combatants: [makeCombatant(actorId, "Alice", 20, false,), makeCombatant("orc", "Orc", 15, true,),],
    },);

    const result = await handleBattleUse(["mystery",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Usage:",);
    expect(result.systemMessage,).toContain("Healing Draught",);
  });

  test("use consumes the item and returns a battle-updated payload", async () => {
    // Damage the orc so the heal lands.
    const active = await getActiveBattle({ database: db, }, chatId,);
    active!.combatants.find((c,) => c.id === "orc")!.hp = 10;

    const result = await handleBattleUse(["draught", "orc",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("battle-updated",);
    expect(result.systemMessage,).toContain("uses **Healing Draught** on Orc",);
    const payload = result.actionPayload as { battle: { items: { quantity: number }[] } };
    expect(payload.battle.items[0]?.quantity,).toBe(1,);
  });

  test("use rejects unknown targets", async () => {
    const result = await handleBattleUse(["draught", "ghost",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no combatant matches",);
  });

  test("social resolves against the active battle", async () => {
    const result = await handleBattleSocial(["intimidate", "orc",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("battle-updated",);
  });

  test("social rejects unknown verbs and targets", async () => {
    const result = await handleBattleSocial(["flee", "orc",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("intimidate",);

    const result2 = await handleBattleSocial(["taunt", "ghost",], ctx(),);
    expect(result2.handled,).toBe(true,);
    expect(result2.systemMessage,).toContain("no combatant",);
  });

  test("stock survived: one unit was consumed by the earlier use", async () => {
    const items = await listUsableBattleItems({ database: db, }, actorId,);
    expect(items[0]?.quantity,).toBe(1,);
    expect(BattleStatus.Active,).toBe("active",); // enum import sanity
  });
});
