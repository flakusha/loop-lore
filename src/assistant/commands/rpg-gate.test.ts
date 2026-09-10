// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { type CommandContext, getCommand, } from "./registry";
import "./dice";
import "./attack";
import "./battle";

describe("RPG command world opt-in gating", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = crypto.randomUUID();
    await insertUsers(db, `rpg-gate-${userId}`, "Rpg Gate", { id: userId, } as never,);
    worldId = crypto.randomUUID();
    await db.insertInto("worlds",).values({
      id: worldId,
      name: "Gate",
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

  function ctx(world?: string,): CommandContext {
    return {
      chatId: crypto.randomUUID(),
      activeChat: world ? { id: "chat", worldId: world, } : undefined,
      db,
      userId,
    };
  }

  test("/roll is denied when dice are off and never rolls", async () => {
    await db.updateTable("worlds",).set({ rpg_dice: 0, },).where("id", "=", worldId,).execute();
    const handler = getCommand("roll",)!;
    const result = await handler(["d20",], ctx(worldId,),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toStartWith("**RPG not enabled:**",);
    expect(result.systemMessage,).not.toContain("\u{1F3B2}",);
  });

  test("/roll runs when dice are on", async () => {
    await db.updateTable("worlds",).set({ rpg_dice: 1, },).where("id", "=", worldId,).execute();
    const handler = getCommand("roll",)!;
    const result = await handler(["d20",], ctx(worldId,),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("\u{1F3B2}",);
  });

  test("/roll keeps historical behavior outside a world chat", async () => {
    const handler = getCommand("roll",)!;
    const result = await handler(["d20",], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("\u{1F3B2}",);
  });

  test("/attack is denied when combat is off", async () => {
    await db.updateTable("worlds",).set({ rpg_combat: 0, },).where("id", "=", worldId,).execute();
    const handler = getCommand("attack",)!;
    const result = await handler(["Orc",], ctx(worldId,),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toStartWith("**RPG not enabled:**",);
  });

  test("/battle is denied when combat is off", async () => {
    const handler = getCommand("battle",)!;
    const result = await handler(["status",], ctx(worldId,),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toStartWith("**RPG not enabled:**",);
  });

  test("/battle status still answers when combat is on", async () => {
    await db.updateTable("worlds",).set({ rpg_combat: 1, },).where("id", "=", worldId,).execute();
    const handler = getCommand("battle",)!;
    const result = await handler(["status",], ctx(worldId,),);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no active encounter",);
  });
});
