/**
 * RPG Loot System Tests
 *
 * Tests loot generation, rarity weighting, and loot table utilities.
 */
import { describe, expect, it, } from "bun:test";
import {
  effectiveWeight,
  generateLoot,
  createLootTable,
  mergeLootTables,
  RARITY_WEIGHTS,
  COMMON_CONSUMABLES,
  WEAPON_LOOT,
  type LootEntry,
} from "./loot.js";

describe("effectiveWeight", () => {
  it("returns base weight at low level", () => {
    expect(effectiveWeight("common", 1,)).toBe(50,);
    expect(effectiveWeight("rare", 1,)).toBe(15,);
  });

  it("increases rare weight at higher levels", () => {
    expect(effectiveWeight("rare", 10,)).toBeGreaterThan(
      effectiveWeight("rare", 1,),
    );
  });

  it("legendary gets bigger bonus at level 10+", () => {
    const low = effectiveWeight("legendary", 5,);
    const high = effectiveWeight("legendary", 10,);
    expect(high).toBeGreaterThan(low,);
  });
});

describe("generateLoot", () => {
  it("returns drops from valid table", () => {
    const result = generateLoot(COMMON_CONSUMABLES, 1, 3,);
    expect(result.drops.length).toBeGreaterThanOrEqual(0,);
    expect(result.drops.length).toBeLessThanOrEqual(3,);
  });

  it("filters by level requirement", () => {
    // High-level items shouldn't drop for level 1
    const result = generateLoot(WEAPON_LOOT, 1, 10,);
    for (const drop of result.drops) {
      // Only common and some uncommon should drop at level 1
      expect(drop.rarity === "common" || drop.rarity === "uncommon").toBe(true,);
    }
  });

  it("higher levels get rarer items", () => {
    // Run many times to check rarity distribution
    let rareCount = 0;
    for (let i = 0; i < 100; i++) {
      const result = generateLoot(WEAPON_LOOT, 15, 1,);
      if (result.drops.length > 0 && result.drops[0]!.rarity !== "common") {
        rareCount++;
      }
    }
    // At level 15, should get some non-common items
    expect(rareCount).toBeGreaterThan(0,);
  });

  it("calculates total gold value", () => {
    const result = generateLoot(COMMON_CONSUMABLES, 1, 5,);
    expect(result.totalGoldValue).toBeGreaterThanOrEqual(0,);
  });

  it("empty table returns no drops", () => {
    const result = generateLoot([], 1, 5,);
    expect(result.drops.length).toBe(0,);
    expect(result.totalGoldValue).toBe(0,);
  });

  it("respects quantity range", () => {
    // Run multiple times to check quantity
    for (let i = 0; i < 50; i++) {
      const result = generateLoot(COMMON_CONSUMABLES, 1, 1,);
      for (const drop of result.drops) {
        expect(drop.quantity).toBeGreaterThanOrEqual(1,);
        expect(drop.quantity).toBeLessThanOrEqual(3,); // Health Potion max 3
      }
    }
  });

  it("marks rare+ drops", () => {
    // Generate from rare-heavy table
    const rareTable: LootEntry[] = [
      { name: "Epic Sword", description: "", type: "weapon", rarity: "rare", weight: 10, minQuantity: 1, maxQuantity: 1, minLevel: 1, goldValue: 1000, metadata: {} },
      { name: "Common Stick", description: "", type: "misc", rarity: "common", weight: 10, minQuantity: 1, maxQuantity: 1, minLevel: 1, goldValue: 1, metadata: {} },
    ];
    const result = generateLoot(rareTable, 20, 5,);
    // With 5 drops from a 50/50 rare/common table, at least one should be rare
    expect(result.hasRareDrop).toBe(true,);
  });
});

describe("createLootTable", () => {
  it("creates entries from item list", () => {
    const table = createLootTable([
      { name: "Sword", rarity: "common", },
      { name: "Shield", rarity: "uncommon", weight: 5, minLevel: 3, },
    ]);
    expect(table.length).toBe(2,);
    expect(table[0]!.name).toBe("Sword",);
    expect(table[0]!.rarity).toBe("common",);
    expect(table[1]!.minLevel).toBe(3,);
  });
});

describe("mergeLootTables", () => {
  it("combines multiple tables", () => {
    const merged = mergeLootTables(COMMON_CONSUMABLES, WEAPON_LOOT,);
    expect(merged.length).toBe(
      COMMON_CONSUMABLES.length + WEAPON_LOOT.length,
    );
  });
});

describe("RARITY_WEIGHTS", () => {
  it("common has highest weight", () => {
    expect(RARITY_WEIGHTS.common).toBeGreaterThan(RARITY_WEIGHTS.uncommon,);
  });

  it("artifact has lowest weight", () => {
    expect(RARITY_WEIGHTS.artifact).toBeLessThan(RARITY_WEIGHTS.legendary,);
  });
});
