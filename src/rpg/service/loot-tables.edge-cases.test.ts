import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { addLootEntry, createLootTable, rollLootTable, } from "./loot-tables.js";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/**
 * Run the callback with Math.random pinned to a fixed draw.
 * @param draw - value Math.random() returns
 * @param fn - async work under the stub
 */
async function withRandom<T,>(draw: number, fn: () => Promise<T>,): Promise<T> {
  const original = Math.random;
  Math.random = () => draw;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

describe("rollLootTable — quantity boundaries", () => {
  test("min === max entries always roll exactly min, whatever the draw", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Fixed", sourceType: "quest", },);
    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Key",
      itemType: "trinket",
      rarity: "rare",
      weight: 1,
      minQuantity: 3,
      maxQuantity: 3,
    },);

    for (const draw of [0, 0.5, 0.999999,]) {
      const result = await withRandom(draw, () => rollLootTable({ database: db, }, tableId,),);
      expect(result?.quantity,).toBe(3,);
    }
  });

  test("quantity reaches max at the top of the draw range", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Ranged", sourceType: "shop", },);
    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Arrows",
      itemType: "ammo",
      rarity: "common",
      weight: 1,
      minQuantity: 2,
      maxQuantity: 5,
    },);

    const result = await withRandom(0.999999, () => rollLootTable({ database: db, }, tableId,),);
    // 2 + floor(0.999999 * 4) = 5
    expect(result?.quantity,).toBe(5,);
  });

  // Degenerate config: totalWeight 0 → random 0 → the first entry wins.
  // Deterministic, so we pin it rather than require an exception.
  test("an all-zero-weight table deterministically rolls the first entry", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Zeroed", sourceType: "chest", },);
    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Coin",
      itemType: "junk",
      rarity: "common",
      weight: 0,
    },);

    await addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Sword",
      itemType: "weapon",
      rarity: "uncommon",
      weight: 0,
    },);

    const result = await withRandom(0.999999, () => rollLootTable({ database: db, }, tableId,),);
    expect(result?.itemName,).toBe("Coin",);
  });

  test("inverted bounds are rejected on write; legacy rows roll the configured minimum", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Inverted", sourceType: "chest", },);

    await expect(addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Bugged Bundle",
      itemType: "junk",
      rarity: "common",
      weight: 1,
      minQuantity: 5,
      maxQuantity: 2,
    },),).rejects.toThrow();

    // Simulate a pre-guard row written straight to the table.
    await db.insertInto("loot_entries",).values({
      loot_table_id: tableId,
      item_name: "Legacy Bundle",
      description: null,
      item_type: "junk",
      weight: 1,
      min_quantity: 5,
      max_quantity: 2,
    },).execute();

    const result = await withRandom(0.999999, () => rollLootTable({ database: db, }, tableId,),);
    expect(result?.quantity,).toBe(5,);
  });

  test("negative entry weights are rejected", async () => {
    const tableId = await createLootTable({ database: db, }, { name: "Negative", sourceType: "chest", },);
    await expect(addLootEntry({ database: db, }, {
      lootTableId: tableId,
      itemName: "Cursed Item",
      itemType: "junk",
      rarity: "common",
      weight: -5,
    },),).rejects.toThrow();
  });
});
