// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import {
  checkCommandMechanic,
  checkMechanicEnabled,
  getMechanicsConfig,
  RpgMechanic,
} from "./world-gate";

describe("world-gate mechanics config", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = crypto.randomUUID();
    await insertUsers(db, `gate-user-${userId}`, "Gate User", { id: userId, } as never,);
  },);

  test("fully armed worlds read back every mechanic on", async () => {
    const worldId = crypto.randomUUID();
    await db.insertInto("worlds",).values({
      id: worldId,
      name: "On",
      owner_id: userId,
      rpg_enabled: 1,
      rpg_dice: 1,
      rpg_checks: 1,
      rpg_combat: 1,
      rpg_xp: 1,
      rpg_loot: 1,
      rpg_quests: 1,
    },).execute();
    const config = await getMechanicsConfig(db, worldId,);
    expect(config,).toEqual({ dice: true, checks: true, combat: true, xp: true, loot: true, quests: true, },);
  });

  test("non-RPG worlds disable every mechanic", async () => {
    const worldId = crypto.randomUUID();
    await db.insertInto("worlds",).values({ id: worldId, name: "Off", owner_id: userId, rpg_enabled: 0, },).execute();
    const config = await getMechanicsConfig(db, worldId,);
    expect(config,).toEqual({ dice: false, checks: false, combat: false, xp: false, loot: false, quests: false, },);
  });

  test("one mechanic can opt out while the rest stay on", async () => {
    const worldId = crypto.randomUUID();
    await db.insertInto("worlds",).values({
      id: worldId,
      name: "Mixed",
      owner_id: userId,
      rpg_enabled: 1,
      rpg_dice: 1,
      rpg_checks: 1,
      rpg_combat: 1,
      rpg_xp: 1,
      rpg_loot: 1,
      rpg_quests: 1,
    },).execute();
    await db.updateTable("worlds",).set({ rpg_dice: 0, },).where("id", "=", worldId,).execute();
    const config = await getMechanicsConfig(db, worldId,);
    expect(config?.dice,).toBe(false,);
    expect(config?.combat,).toBe(true,);
  });

  test("missing world resolves to null config and World-not-found denial", async () => {
    expect(await getMechanicsConfig(db, crypto.randomUUID(),),).toBeNull();
    const gate = await checkMechanicEnabled(db, crypto.randomUUID(), RpgMechanic.Combat,);
    expect(gate.allowed,).toBe(false,);
    expect(gate.reason,).toBe("World not found",);
  });

  test("disabled mechanic denial names the mechanic", async () => {
    const worldId = crypto.randomUUID();
    await db.insertInto("worlds",).values({ id: worldId, name: "NoCombat", owner_id: userId, rpg_enabled: 0, },)
      .execute();
    const gate = await checkMechanicEnabled(db, worldId, RpgMechanic.Combat,);
    expect(gate.allowed,).toBe(false,);
    expect(gate.reason,).toContain("combat",);
  });

  test("command gate fails open without database or world context", async () => {
    expect(await checkCommandMechanic(undefined, "w", RpgMechanic.Dice,),).toBeNull();
    expect(await checkCommandMechanic(db, undefined, RpgMechanic.Dice,),).toBeNull();
  });

  test("command gate allows enabled mechanics and denies disabled ones", async () => {
    const worldId = crypto.randomUUID();
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
    expect(await checkCommandMechanic(db, worldId, RpgMechanic.Dice,),).toBeNull();
    await db.updateTable("worlds",).set({ rpg_dice: 0, },).where("id", "=", worldId,).execute();
    const denial = await checkCommandMechanic(db, worldId, RpgMechanic.Dice,);
    expect(denial,).toStartWith("**RPG not enabled:**",);
  });
});
