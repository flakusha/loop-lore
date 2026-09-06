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
      id: "e1",
      name: "Sword",
      rarity: "common",
      weight: 1,
      minLevel: 10,
      goldValue: 100,
      tags: [],
      description: "",
    };
    const result = generateLoot([entry,], 5, 1, 0,);
    expect(result.drops,).toHaveLength(0,);
  });
  it("eligible entry is included in drops", () => {
    const entry: LootEntry = {
      id: "e1",
      name: "Sword",
      rarity: "common",
      weight: 1,
      minLevel: 1,
      goldValue: 100,
      tags: [],
      description: "",
    };
    const result = generateLoot([entry,], 5, 1, 0,);
    expect(result.drops.length,).toBeGreaterThanOrEqual(1,);
  });
});
