import { describe, expect, it, } from "bun:test";
import { generateLoot, } from "../../rpg/loot/generation";
import type { LootEntry, } from "../../rpg/loot/types";

describe("rpg/loot/generation (real logic)", () => {
  it("empty entries returns empty drops", () => {
    const result = generateLoot([], 1, 3, 0,);
    expect(result.drops,).toHaveLength(0,);
    expect(result.totalGoldValue,).toBe(0,);
    expect(result.hasRareDrop,).toBe(false,);
  });
  it("entry below minLevel is excluded", () => {
    const entry: LootEntry = {
      itemId: "e1",
      name: "Sword",
      rarity: "common",
      weight: 1,
      minLevel: 10,
      goldValue: 100,
      description: "",
      type: "weapon",
      minQuantity: 1,
      maxQuantity: 1,
      metadata: {},
    };
    const result = generateLoot([entry,], 5, 1, 0,);
    expect(result.drops,).toHaveLength(0,);
  });
  it("eligible entry is included in drops", () => {
    const entry: LootEntry = {
      itemId: "e1",
      name: "Sword",
      rarity: "common",
      weight: 1,
      minLevel: 1,
      goldValue: 100,
      description: "",
      type: "weapon",
      minQuantity: 1,
      maxQuantity: 1,
      metadata: {},
    };
    const result = generateLoot([entry,], 5, 1, 0,);
    expect(result.drops.length,).toBeGreaterThanOrEqual(1,);
  });

  it("positive luck biases toward the rarer (later) entry, negative toward common (BUG-rpg-loot-luckmodifier-inverts-drop-quality)", () => {
    const common: LootEntry = {
      itemId: "c1",
      name: "Pebble",
      rarity: "common",
      weight: 50,
      minLevel: 1,
      goldValue: 1,
      description: "",
      type: "material",
      minQuantity: 1,
      maxQuantity: 1,
      metadata: {},
    };
    const rare: LootEntry = {
      itemId: "r1",
      name: "Gem",
      rarity: "rare",
      weight: 15,
      minLevel: 1,
      goldValue: 500,
      description: "",
      type: "material",
      minQuantity: 1,
      maxQuantity: 1,
      metadata: {},
    };
    // luckModifier=99 forces adjustedRoll=100 -> threshold=totalWeight -> only
    // the rare (last-cumulative) entry can cross it, deterministically.
    const lucky = generateLoot([common, rare,], 1, 1, 99,);
    expect(lucky.drops[0]?.name,).toBe("Gem",);
    // luckModifier=-99 forces adjustedRoll=1 -> threshold near zero -> the
    // common (first) entry wins, deterministically.
    const unlucky = generateLoot([common, rare,], 1, 1, -99,);
    expect(unlucky.drops[0]?.name,).toBe("Pebble",);
  });
});
