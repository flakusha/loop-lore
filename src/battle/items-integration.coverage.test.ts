// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Items-integration coverage — equipment modifiers with durability scaling,
 * equip requirements, durability damage/repair, loot generation (including
 * deterministic edges), sell pricing, slot queries, and weight totals.
 */
import { describe, expect, test, } from "bun:test";
import type { CombatStats, } from "./integration-schemas/stats.js";
import type { EquipmentItem, } from "./item-mapping.js";
import {
  applyDurabilityDamage,
  calculateEquipmentModifiers,
  calculateSellPrice,
  calculateTotalWeight,
  canEquipItem,
  generateLoot,
  getEquippedInSlot,
  getEquippedItems,
  type LootTableEntry,
  repairItem,
} from "./items-integration.js";

/**
 * @param overrides
 */
function item(overrides: Partial<EquipmentItem> = {},): EquipmentItem {
  return {
    id: "itm-1",
    name: "Iron Sword",
    type: "weapon",
    slot: "weapon",
    rarity: "common",
    modifiers: [{ stat: "attack", value: 10, },],
    durability: 100,
    maxDurability: 100,
    equipped: true,
    requiredLevel: 1,
    description: "A blade.",
    ...overrides,
  };
}

/** */
function stats(): CombatStats {
  return {
    characterId: "c1",
    health: 100,
    maxHealth: 100,
    mana: 50,
    maxMana: 50,
    stamina: 50,
    maxStamina: 50,
    attack: 12,
    defense: 8,
    magicAttack: 5,
    magicDefense: 5,
    speed: 10,
    criticalChance: 5,
    dodgeChance: 5,
    accuracy: 80,
  };
}

describe("calculateEquipmentModifiers", () => {
  test("scales modifiers by remaining durability", () => {
    const mods = calculateEquipmentModifiers([item({ durability: 50, maxDurability: 100, },),],);
    expect(mods,).toEqual([{ stat: "attack", value: 5, },],);
  });

  test("skips unequipped items", () => {
    expect(calculateEquipmentModifiers([item({ equipped: false, },),],),).toEqual([],);
  });

  test("broken items contribute zero", () => {
    const mods = calculateEquipmentModifiers([item({ durability: 0, },),],);
    expect(mods,).toEqual([{ stat: "attack", value: 0, },],);
  });

  test("empty inventory yields no modifiers", () => {
    expect(calculateEquipmentModifiers([],),).toEqual([],);
  });

  test("aggregates across several equipped items", () => {
    const mods = calculateEquipmentModifiers([
      item({ modifiers: [{ stat: "attack", value: 10, },], },),
      item({
        id: "itm-2",
        modifiers: [{ stat: "defense", value: 4, },],
      },),
    ],);
    expect(mods,).toHaveLength(2,);
  });
});

describe("canEquipItem", () => {
  test("rejects under-leveled characters", () => {
    const r = canEquipItem(item({ requiredLevel: 10, },), 3, stats(),);
    expect(r,).toEqual({ canEquip: false, reason: "Requires level 10", },);
  });

  test("rejects unmet stat requirements", () => {
    const r = canEquipItem(item({ requiredStats: { attack: 99, }, },), 10, stats(),);
    expect(r,).toEqual({ canEquip: false, reason: "Requires attack 99", },);
  });

  test("rejects broken items", () => {
    const r = canEquipItem(item({ durability: 0, },), 10, stats(),);
    expect(r,).toEqual({ canEquip: false, reason: "Item is broken", },);
  });

  test("accepts a qualifying character", () => {
    const r = canEquipItem(item({ requiredLevel: 1, requiredStats: { attack: 5, }, },), 10, stats(),);
    expect(r,).toEqual({ canEquip: true, },);
  });

  test("boundary — exact level and exact stat pass", () => {
    const r = canEquipItem(item({ requiredLevel: 10, requiredStats: { attack: 12, }, },), 10, stats(),);
    expect(r.canEquip,).toBe(true,);
  });
});

describe("applyDurabilityDamage / repairItem", () => {
  test("damage reduces durability", () => {
    expect(applyDurabilityDamage(item(), 30,).durability,).toBe(70,);
  });

  test("damage floors at zero and preserves the rest of the item", () => {
    const out = applyDurabilityDamage(item({ durability: 5, },), 99,);
    expect(out.durability,).toBe(0,);
    expect(out.id,).toBe("itm-1",);
  });

  test("repair restores up to the cap and reports gold spent", () => {
    const { item: fixed, goldSpent, } = repairItem(item({ durability: 60, },), 30, 25,);
    expect(fixed.durability,).toBe(90,);
    expect(goldSpent,).toBe(25,);
  });

  test("repair never exceeds max durability", () => {
    expect(repairItem(item(), 50, 10,).item.durability,).toBe(100,);
  });
});

describe("generateLoot", () => {
  test("empty table drops nothing", () => {
    expect(generateLoot([], 10,),).toEqual([],);
  });

  test("under-leveled monsters drop nothing (level gate)", () => {
    const table: LootTableEntry[] = [{
      itemId: "gem",
      dropChance: 100,
      minQuantity: 1,
      maxQuantity: 5,
      requiredLevel: 5,
    },];
    expect(generateLoot(table, 1,),).toEqual([],);
  });

  test("zero-percent drops never land", () => {
    const table: LootTableEntry[] = [{
      itemId: "gem",
      dropChance: 0,
      minQuantity: 1,
      maxQuantity: 1,
      requiredLevel: 1,
    },];
    expect(generateLoot(table, 10,),).toEqual([],);
  });

  test("guaranteed drops land with fixed quantity when min equals max", () => {
    const table: LootTableEntry[] = [{
      itemId: "gem",
      dropChance: 100,
      minQuantity: 3,
      maxQuantity: 3,
      requiredLevel: 1,
    },];
    expect(generateLoot(table, 10,),).toEqual([{ itemId: "gem", quantity: 3, },],);
  });

  test("guaranteed range drops stay within bounds", () => {
    const table: LootTableEntry[] = [{
      itemId: "gem",
      dropChance: 100,
      minQuantity: 1,
      maxQuantity: 6,
      requiredLevel: 1,
    },];
    for (let i = 0; i < 20; i++) {
      const [drop,] = generateLoot(table, 10,);
      expect(drop?.quantity,).toBeGreaterThanOrEqual(1,);
      expect(drop?.quantity,).toBeLessThanOrEqual(6,);
    }
  });

  test("boundary — monster at exactly the required level may drop", () => {
    const table: LootTableEntry[] = [{
      itemId: "gem",
      dropChance: 100,
      minQuantity: 1,
      maxQuantity: 1,
      requiredLevel: 5,
    },];
    expect(generateLoot(table, 5,),).toHaveLength(1,);
  });
});

describe("calculateSellPrice", () => {
  test("common at full durability halves the base price", () => {
    expect(calculateSellPrice(item(), 100,),).toBe(50,);
  });

  test("rarity multiplies the price", () => {
    expect(calculateSellPrice(item({ rarity: "legendary", },), 100,),).toBe(500,);
    expect(calculateSellPrice(item({ rarity: "artifact", },), 100,),).toBe(1000,);
  });

  test("broken items sell for nothing", () => {
    expect(calculateSellPrice(item({ durability: 0, rarity: "legendary", },), 100,),).toBe(0,);
  });

  test("half durability halves again", () => {
    expect(calculateSellPrice(item({ durability: 50, },), 100,),).toBe(25,);
  });
});

describe("slot queries and weight", () => {
  test("getEquippedInSlot finds the equipped weapon only", () => {
    const inv = [item(), item({ id: "itm-2", equipped: false, },),];
    expect(getEquippedInSlot(inv, "weapon",)?.id,).toBe("itm-1",);
    expect(getEquippedInSlot(inv, "armor",),).toBeUndefined();
  });

  test("getEquippedItems filters to equipped", () => {
    const inv = [item(), item({ id: "itm-2", equipped: false, },),];
    expect(getEquippedItems(inv,).map((i,) => i.id),).toEqual(["itm-1",],);
    expect(getEquippedItems([],),).toEqual([],);
  });

  test("calculateTotalWeight sums known weights and ignores unknowns", () => {
    const weights = new Map([["itm-1", 2.5,], ["itm-2", 1.5,],],);
    expect(calculateTotalWeight([item(), item({ id: "itm-2", },), item({ id: "ghost", },),], weights,),).toBe(4,);
    expect(calculateTotalWeight([], weights,),).toBe(0,);
  });
});
