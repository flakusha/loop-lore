import { describe, expect, it, } from "bun:test";
import { createLootTable, mergeLootTables, } from "../../../rpg/loot/table";

describe("rpg/loot/table (real logic)", () => {
  it("createLootTable maps rarity to weight", () => {
    const table = createLootTable([{ name: "Sword", rarity: "rare", weight: 10, },],);
    expect(table,).toHaveLength(1,);
    expect(table[0]!.name,).toBe("Sword",);
    expect(table[0]!.rarity,).toBe("rare",);
    expect(table[0]!.weight,).toBe(10,);
  });
  it("mergeLootTables combines entries", () => {
    const merged = mergeLootTables(
      [{
        name: "A",
        rarity: "common",
        weight: 1,
        minLevel: 1,
        description: "",
        type: "misc",
        goldValue: 0,
        metadata: {},
      },],
      [{
        name: "B",
        rarity: "rare",
        weight: 5,
        minLevel: 1,
        description: "",
        type: "misc",
        goldValue: 0,
        metadata: {},
      },],
    );
    expect(merged,).toHaveLength(2,);
    expect(merged.map((e,) => e.name),).toContain("A",);
    expect(merged.map((e,) => e.name),).toContain("B",);
  });
});
