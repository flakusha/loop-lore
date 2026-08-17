// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Stats Service Tests
 *
 * Tests create/get/update operations against an in-memory SQLite DB.
 */
import { describe, expect, it, beforeEach, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import {
  createCharacterStats,
  getCharacterStats,
  updateCharacterStats,
} from "./character-stats";
import { checkRpgEnabled, } from "./world-gate";

let db: Kysely<DB>;

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
},);

describe("createCharacterStats", () => {
  it("creates stats with required fields", async () => {
    await insertUsers(db, "hero-owner", "Hero Owner", { id: "user-1", },);
    await insertActors(db, "Test Hero", { id: "actor-1", owner_id: "user-1", },);
    const id = await createCharacterStats({ database: db, }, {
      actorId: "actor-1",
      hp: 20,
      maxHp: 20,
      ac: 15,
    },);

    expect(id,).toBeDefined();
    expect(typeof id,).toBe("string",);
  },);

  it("creates stats with all optional fields", async () => {
    await insertUsers(db, "wizard-owner", "Wizard Owner", { id: "user-1", },);
    await insertActors(db, "Wizard", { id: "actor-2", owner_id: "user-1", },);
    const id = await createCharacterStats({ database: db, }, {
      actorId: "actor-2",
      hp: 8,
      maxHp: 8,
      ac: 12,
      level: 3,
      mp: 20,
      maxMp: 20,
      speed: 25,
      str: 8,
      dex: 14,
      con: 12,
      int: 17,
      wis: 13,
      cha: 10,
      behaviorProfile: "companion",
      evasiveness: 0.3,
      cooperativeness: 0.7,
      aggressionThreshold: 0.2,
    },);

    const stats = await getCharacterStats({ database: db, }, "actor-2",);
    expect(stats,).not.toBeNull();
    expect(stats!.id,).toBe(id,);
    expect(stats!.level,).toBe(3,);
    expect(stats!.hp,).toBe(8,);
    expect(stats!.str,).toBe(8,);
    expect(stats!.int,).toBe(17,);
    expect(stats!.behaviorProfile,).toBe("companion",);
    expect(stats!.evasiveness,).toBeCloseTo(0.3,);
    expect(stats!.characterState,).toBe("active",);
    expect(stats!.conditions,).toBe("[]",);
  },);
},);

describe("getCharacterStats", () => {
  it("returns null when no stats exist", async () => {
    const stats = await getCharacterStats({ database: db, }, "nonexistent",);
    expect(stats,).toBeNull();
  },);

  it("returns stats after creation", async () => {
    await insertUsers(db, "fighter-owner", "Fighter Owner", { id: "user-1", },);
    await insertActors(db, "Fighter", { id: "actor-3", owner_id: "user-1", },);
    await createCharacterStats({ database: db, }, {
      actorId: "actor-3",
      hp: 30,
      maxHp: 30,
      ac: 18,
      str: 16,
      dex: 12,
      con: 14,
    },);

    const stats = await getCharacterStats({ database: db, }, "actor-3",);
    expect(stats,).not.toBeNull();
    expect(stats!.hp,).toBe(30,);
    expect(stats!.maxHp,).toBe(30,);
    expect(stats!.ac,).toBe(18,);
    expect(stats!.str,).toBe(16,);
    expect(stats!.dex,).toBe(12,);
    expect(stats!.con,).toBe(14,);
  },);
},);

describe("updateCharacterStats", () => {
  it("updates hp and maxHp", async () => {
    await insertUsers(db, "rogue-owner", "Rogue Owner", { id: "user-1", },);
    await insertActors(db, "Rogue", { id: "actor-4", owner_id: "user-1", },);
    await createCharacterStats({ database: db, }, {
      actorId: "actor-4",
      hp: 20,
      maxHp: 20,
      ac: 14,
    },);

    const stats = await getCharacterStats({ database: db, }, "actor-4",);
    const updated = await updateCharacterStats({ database: db, }, stats!.id, {
      hp: 15,
      maxHp: 25,
    },);

    expect(updated,).toBe(true,);

    const refreshed = await getCharacterStats({ database: db, }, "actor-4",);
    expect(refreshed!.hp,).toBe(15,);
    expect(refreshed!.maxHp,).toBe(25,);
    expect(refreshed!.ac,).toBe(14,); // unchanged
  },);

  it("updates cognition fields", async () => {
    await insertUsers(db, "npc-owner", "NPC Owner", { id: "user-1", },);
    await insertActors(db, "NPC", { id: "actor-5", owner_id: "user-1", },);
    await createCharacterStats({ database: db, }, {
      actorId: "actor-5",
      hp: 10,
      maxHp: 10,
      ac: 10,
    },);

    const stats = await getCharacterStats({ database: db, }, "actor-5",);
    await updateCharacterStats({ database: db, }, stats!.id, {
      behaviorProfile: "merchant",
      evasiveness: 0.8,
      cooperativeness: 0.2,
      aggressionThreshold: 0.9,
      characterState: "injured",
      conditions: JSON.stringify([{ name: "Poisoned", source: "snake bite", }],),
    },);

    const refreshed = await getCharacterStats({ database: db, }, "actor-5",);
    expect(refreshed!.behaviorProfile,).toBe("merchant",);
    expect(refreshed!.evasiveness,).toBeCloseTo(0.8,);
    expect(refreshed!.cooperativeness,).toBeCloseTo(0.2,);
    expect(refreshed!.aggressionThreshold,).toBeCloseTo(0.9,);
    expect(refreshed!.characterState,).toBe("injured",);

    const conditions = JSON.parse(refreshed!.conditions,) as Array<{ name: string }>;
    expect(conditions[0]!.name,).toBe("Poisoned",);
  },);

  it("returns false when no fields provided", async () => {
    await insertUsers(db, "empty-owner", "Empty Owner", { id: "user-1", },);
    await insertActors(db, "Empty", { id: "actor-6", owner_id: "user-1", },);
    await createCharacterStats({ database: db, }, {
      actorId: "actor-6",
      hp: 10,
      maxHp: 10,
      ac: 10,
    },);

    const stats = await getCharacterStats({ database: db, }, "actor-6",);
    const updated = await updateCharacterStats({ database: db, }, stats!.id, {},);
    expect(updated,).toBe(false,);
  },);
},);

describe("checkRpgEnabled (world-gate)", () => {
  it("returns allowed=true when rpg_enabled=1", async () => {
    await insertUsers(db, "owner1", "Owner One", { id: "user-1", },);
    await insertWorlds(db, "user-1", "RPG World", { id: "world-1", rpg_enabled: 1, },);
    const result = await checkRpgEnabled(db, "world-1",);
    expect(result.allowed,).toBe(true,);
  },);

  it("returns allowed=false when rpg_enabled=0", async () => {
    await insertUsers(db, "owner2", "Owner Two", { id: "user-2", },);
    await insertWorlds(db, "user-2", "Non-RPG World", { id: "world-2", rpg_enabled: 0, },);
    const result = await checkRpgEnabled(db, "world-2",);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toContain("not enabled",);
  },);

  it("returns allowed=false when world not found", async () => {
    const result = await checkRpgEnabled(db, "nonexistent",);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toContain("not found",);
  },);
},);
