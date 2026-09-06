/**
 * RPG Loot Weight and Table Tests
 *
 * Pins rarity scaling, table defaults, and level gating.
 */
import { describe, expect, it, } from "bun:test";
import { generateLoot, } from "./generation.js";
import { createLootTable, mergeLootTables, } from "./table.js";
import { effectiveWeight, } from "./weights.js";

describe("effectiveWeight", () => {
  it("returns base weight below level 5", () => {
    expect(effectiveWeight("common", 1,),).toBe(50,);
    expect(effectiveWeight("rare", 1,),).toBe(15,);
  });
  it("adds double bonus at level 5", () => {
    expect(effectiveWeight("rare", 5,),).toBe(17,);
    expect(effectiveWeight("legendary", 5,),).toBe(8,);
  });
  it("adds quintuple bonus at level 10", () => {
    expect(effectiveWeight("rare", 10,),).toBe(20,);
    expect(effectiveWeight("artifact", 10,),).toBe(16,);
  });
});

describe("createLootTable", () => {
  it("fills defaults from rarity weights", () => {
    const [entry,] = createLootTable([{ name: "Rusty Dagger", rarity: "common", },],);
    expect(entry?.weight,).toBe(50,);
    expect(entry?.minLevel,).toBe(1,);
    expect(entry?.minQuantity,).toBe(1,);
  });
  it("keeps explicit weight and level", () => {
    const [entry,] = createLootTable([{ name: "Kingsfall", rarity: "legendary", weight: 99, minLevel: 10, },],);
    expect(entry?.weight,).toBe(99,);
    expect(entry?.minLevel,).toBe(10,);
  });
});

describe("mergeLootTables", () => {
  it("concatenates entries in order", () => {
    const a = createLootTable([{ name: "A", rarity: "common", },],);
    const b = createLootTable([{ name: "B", rarity: "rare", },],);
    const merged = mergeLootTables(a, b,);
    expect(merged.map((e,) => e.name),).toEqual(["A", "B",],);
  });
  it("merges zero tables to empty", () => {
    expect(mergeLootTables(),).toEqual([],);
  });
});

describe("generateLoot", () => {
  it("returns empty when nothing is level-eligible", () => {
    const table = createLootTable([{ name: "Kingsfall", rarity: "legendary", minLevel: 10, },],);
    expect(generateLoot(table, 1,),).toEqual({ drops: [], totalGoldValue: 0, hasRareDrop: false, worldItemIds: [], },);
  });
  it("drops exactly one eligible entry by default", () => {
    const table = createLootTable([{ name: "A", rarity: "common", },],);
    const res = generateLoot(table, 1,);
    expect(res.drops,).toHaveLength(1,);
    expect(res.drops[0]?.name,).toBe("A",);
  });
});
