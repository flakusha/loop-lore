// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for dice-roll, xp, and loot-tables services.
 *
 * All tests run log-then-read round-trips against a real in-memory
 * SQLite DB (full migrations): field mapping, chat filters, limit and
 * default-limit branches, unknown-id empty results, loot weight
 * accounting, and deterministic weighted rolls.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { insertActors, } from "../../test-utils/insert-helpers.js";
import { uid, } from "../../utils.js";
import { getDiceRollHistory, logDiceRoll, } from "./dice-roll.js";
import { addLootEntry, createLootTable, rollLootTable, } from "./loot-tables.js";
import { getXpHistory, logXp, } from "./xp.js";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

describe("dice-roll service", () => {
  test("logDiceRoll persists every field and returns the id", async () => {
    const userId = uid();
    const actorId = uid();
    await insertActors(db, "Dice Actor", { id: actorId, },);
    const id = await logDiceRoll({ database: db, }, {
      userId,
      chatId: "chat-dice-1",
      actorId,
      sides: 20,
      count: 2,
      modifier: 3,
      advantageMode: "normal",
      exploding: true,
      rawRolls: [14, 7,],
      rawTotal: 21,
      total: 24,
      purpose: "attack roll",
    },);
    expect(typeof id,).toBe("string",);
    expect(id.length,).toBeGreaterThan(0,);

    const row = await db.selectFrom("dice_roll_history",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.user_id,).toBe(userId,);
    expect(row.chat_id,).toBe("chat-dice-1",);
    expect(row.actor_id,).toBe(actorId,);
    expect(row.sides,).toBe(20,);
    expect(row.count,).toBe(2,);
    expect(row.modifier,).toBe(3,);
    expect(row.advantage_mode,).toBe("normal",);
    expect(row.exploding,).toBe(1,);
    expect(JSON.parse(row.raw_rolls,),).toEqual([14, 7,],);
    expect(row.raw_total,).toBe(21,);
    expect(row.total,).toBe(24,);
    expect(row.purpose,).toBe("attack roll",);
  });

  test("logDiceRoll stores nulls for omitted optionals and 0 for non-exploding", async () => {
    const userId = uid();
    const id = await logDiceRoll({ database: db, }, {
      userId,
      sides: 6,
      count: 1,
      modifier: 0,
      advantageMode: "normal",
      exploding: false,
      rawRolls: [4,],
      rawTotal: 4,
      total: 4,
    },);
    const row = await db.selectFrom("dice_roll_history",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.chat_id,).toBeNull();
    expect(row.actor_id,).toBeNull();
    expect(row.exploding,).toBe(0,);
    expect(row.purpose,).toBeNull();
  });

  test("getDiceRollHistory maps fields, orders newest-first, and honors limit", async () => {
    const userId = uid();
    const first = await logDiceRoll({ database: db, }, {
      userId,
      sides: 20,
      count: 1,
      modifier: 0,
      advantageMode: "advantage",
      exploding: false,
      rawRolls: [12,],
      rawTotal: 12,
      total: 12,
      purpose: "first",
    },);
    const second = await logDiceRoll({ database: db, }, {
      userId,
      sides: 20,
      count: 1,
      modifier: 1,
      advantageMode: "normal",
      exploding: false,
      rawRolls: [9,],
      rawTotal: 9,
      total: 10,
      purpose: "second",
    },);
    // Force a deterministic created_at order (same-second inserts tie).
    await db.updateTable("dice_roll_history",)
      .set({ created_at: "2026-01-01T00:00:00.000Z", },)
      .where("id", "=", first,)
      .execute();
    await db.updateTable("dice_roll_history",)
      .set({ created_at: "2026-01-02T00:00:00.000Z", },)
      .where("id", "=", second,)
      .execute();

    const history = await getDiceRollHistory({ database: db, }, { userId, },);
    expect(history.map((h,) => h.id),).toEqual([second, first,],);
    expect(history[0],).toMatchObject({
      sides: 20,
      count: 1,
      modifier: 1,
      advantageMode: "normal",
      total: 10,
      purpose: "second",
      createdAt: "2026-01-02T00:00:00.000Z",
    },);

    const limited = await getDiceRollHistory({ database: db, }, { userId, limit: 1, },);
    expect(limited.map((h,) => h.id),).toEqual([second,],);
  });

  test("getDiceRollHistory filters by chatId and returns empty for unknown user", async () => {
    const userId = uid();
    await logDiceRoll({ database: db, }, {
      userId,
      chatId: "chat-a",
      sides: 6,
      count: 1,
      modifier: 0,
      advantageMode: "normal",
      exploding: false,
      rawRolls: [3,],
      rawTotal: 3,
      total: 3,
    },);
    await logDiceRoll({ database: db, }, {
      userId,
      chatId: "chat-b",
      sides: 6,
      count: 1,
      modifier: 0,
      advantageMode: "normal",
      exploding: false,
      rawRolls: [5,],
      rawTotal: 5,
      total: 5,
    },);

    const chatA = await getDiceRollHistory({ database: db, }, { userId, chatId: "chat-a", },);
    expect(chatA,).toHaveLength(1,);
    expect(chatA[0]?.total,).toBe(3,);

    const missing = await getDiceRollHistory({ database: db, }, { userId: uid(), },);
    expect(missing,).toEqual([],);
  });
});

describe("xp service", () => {
  test("logXp persists every field and returns the id", async () => {
    const actorId = uid();
    await insertActors(db, "XP Actor", { id: actorId, },);
    const id = await logXp({ database: db, }, {
      actorId,
      amount: 150,
      source: "combat",
      description: "Defeated goblin",
      referenceId: "battle-1",
      chatId: "chat-xp-1",
    },);
    expect(id.length,).toBeGreaterThan(0,);

    const row = await db.selectFrom("xp_ledger",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.actor_id,).toBe(actorId,);
    expect(row.amount,).toBe(150,);
    expect(row.source,).toBe("combat",);
    expect(row.description,).toBe("Defeated goblin",);
    expect(row.reference_id,).toBe("battle-1",);
    expect(row.chat_id,).toBe("chat-xp-1",);
  });

  test("logXp stores nulls for omitted optionals", async () => {
    const actorId = uid();
    await insertActors(db, "XP Minimal", { id: actorId, },);
    const id = await logXp({ database: db, }, { actorId, amount: 10, source: "quest", },);
    const row = await db.selectFrom("xp_ledger",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.description,).toBeNull();
    expect(row.reference_id,).toBeNull();
    expect(row.chat_id,).toBeNull();
  });

  test("getXpHistory maps fields, honors limit, and returns empty for unknown actor", async () => {
    const actorId = uid();
    await insertActors(db, "XP History", { id: actorId, },);
    const first = await logXp({ database: db, }, {
      actorId,
      amount: 25,
      source: "quest",
      description: "first",
    },);
    const second = await logXp({ database: db, }, {
      actorId,
      amount: 75,
      source: "combat",
      description: "second",
    },);
    await db.updateTable("xp_ledger",)
      .set({ created_at: "2026-01-01T00:00:00.000Z", },)
      .where("id", "=", first,)
      .execute();
    await db.updateTable("xp_ledger",)
      .set({ created_at: "2026-01-02T00:00:00.000Z", },)
      .where("id", "=", second,)
      .execute();

    const history = await getXpHistory({ database: db, }, actorId,);
    expect(history.map((h,) => h.id),).toEqual([second, first,],);
    expect(history[0],).toMatchObject({ amount: 75, source: "combat", description: "second", },);
    expect(typeof history[0]?.createdAt,).toBe("string",);

    const limited = await getXpHistory({ database: db, }, actorId, 1,);
    expect(limited.map((h,) => h.id),).toEqual([second,],);

    expect(await getXpHistory({ database: db, }, uid(),),).toEqual([],);
  });
});

describe("loot-tables service", () => {
  test("createLootTable persists name/source with zero weight and unused flag", async () => {
    const id = await createLootTable({ database: db, }, {
      name: "Goblin Hoard",
      sourceType: "monster",
      sourceId: "goblin-1",
    },);
    const row = await db.selectFrom("loot_tables",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.name,).toBe("Goblin Hoard",);
    expect(row.source_type,).toBe("monster",);
    expect(row.source_id,).toBe("goblin-1",);
    expect(row.total_weight,).toBe(0,);
    expect(row.used,).toBe(0,);
  });

  test("createLootTable stores null sourceId when omitted", async () => {
    const id = await createLootTable({ database: db, }, { name: "Wild Cache", sourceType: "wild", },);
    const row = await db.selectFrom("loot_tables",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.source_id,).toBeNull();
  });

  test("addLootEntry applies quantity/level defaults and accumulates total weight", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Chest", sourceType: "chest", },);
    const entryId = await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Rusty Dagger",
      itemType: "weapon",
      rarity: "common",
      weight: 10,
    },);
    const entry = await db.selectFrom("loot_entries",)
      .where("id", "=", entryId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(entry.loot_table_id,).toBe(tableId,);
    expect(entry.item_name,).toBe("Rusty Dagger",);
    expect(entry.description,).toBeNull();
    expect(entry.min_quantity,).toBe(1,);
    expect(entry.max_quantity,).toBe(1,);
    expect(entry.min_level,).toBe(0,);
    expect(JSON.parse(entry.metadata,),).toEqual({},);

    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Healing Potion",
      description: "Restores health",
      itemType: "consumable",
      rarity: "uncommon",
      weight: 5,
      minQuantity: 1,
      maxQuantity: 3,
      minLevel: 2,
      metadata: { effect: "heal", },
    },);
    const table = await db.selectFrom("loot_tables",)
      .where("id", "=", tableId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(table.total_weight,).toBe(15,);
  });

  test("rollLootTable returns null for empty and unknown tables", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Empty", sourceType: "none", },);
    expect(await rollLootTable({ database: db, }, tableId,),).toBeNull();
    expect(await rollLootTable({ database: db, }, uid(),),).toBeNull();
  });

  test("rollLootTable with one fixed-quantity entry returns it and marks the table used", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Solo", sourceType: "quest", },);
    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Amulet of Dawn",
      description: "Warm to the touch",
      itemType: "trinket",
      rarity: "rare",
      weight: 1,
      minQuantity: 2,
      maxQuantity: 2,
    },);
    const result = await rollLootTable({ database: db, }, tableId,);
    expect(result,).toEqual({
      itemName: "Amulet of Dawn",
      description: "Warm to the touch",
      itemType: "trinket",
      rarity: "rare",
      quantity: 2,
    },);
    const table = await db.selectFrom("loot_tables",)
      .where("id", "=", tableId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(table.used,).toBe(1,);
  });

  test("rollLootTable weighted selection honors the random draw across entries", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Mixed", sourceType: "chest", },);
    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Common Stone",
      itemType: "junk",
      rarity: "common",
      weight: 90,
      minQuantity: 1,
      maxQuantity: 1,
    },);
    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Dragon Egg",
      itemType: "treasure",
      rarity: "legendary",
      weight: 10,
      minQuantity: 1,
      maxQuantity: 1,
    },);

    const original = Math.random;
    try {
      Math.random = () => 0;
      const first = await rollLootTable({ database: db, }, tableId,);
      expect(first?.itemName,).toBe("Common Stone",);

      Math.random = () => 0.999999;
      const last = await rollLootTable({ database: db, }, tableId,);
      expect(last?.itemName,).toBe("Dragon Egg",);
      expect(last?.quantity,).toBe(1,);
    } finally {
      Math.random = original;
    }
  });

  test("rollLootTable quantity falls inside the entry range", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Ranged", sourceType: "shop", },);
    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Arrows",
      itemType: "ammo",
      rarity: "common",
      weight: 1,
      minQuantity: 5,
      maxQuantity: 10,
    },);
    const original = Math.random;
    try {
      Math.random = () => 0.5;
      const result = await rollLootTable({ database: db, }, tableId,);
      // quantity = 5 + floor(0.5 * 6) = 8
      expect(result?.quantity,).toBe(8,);
    } finally {
      Math.random = original;
    }
  });
});
