// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Inventory grid tests: sort/filter units.
 */
import { describe, expect, test, } from "bun:test";
import {
  filterItems,
  type InventoryItem,
  isItemEquipped,
  isItemUsable,
  itemTags,
  sortItems,
} from "./inventory-grid";

const sword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "sword",
  name: "Iron Sword",
  itemType: "weapon",
  rarity: "common",
  quantity: 1,
  value: 50,
  ...overrides,
});

const potion = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "potion",
  name: "Health Potion",
  itemType: "consumable",
  rarity: "uncommon",
  quantity: 3,
  value: 25,
  ...overrides,
});

const shield = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "shield",
  name: "Wooden Shield",
  itemType: "armor",
  rarity: "rare",
  quantity: 1,
  value: 75,
  ...overrides,
});

describe("sortItems", () => {
  test("sorts by name by default without touching the input", () => {
    const items = [sword(), shield(), potion(),];
    expect(sortItems(items,).map((item,) => item.id),).toEqual(["potion", "sword", "shield",],);
    expect(items[0]?.id,).toBe("sword",);
  });

  test("sorts rarity and value descending with name tiebreak", () => {
    const items = [sword(), shield(), potion(),];
    expect(sortItems(items, "rarity",).map((item,) => item.id),).toEqual(["shield", "potion", "sword",],);
    expect(sortItems(items, "value",).map((item,) => item.id),).toEqual(["shield", "sword", "potion",],);
  });

  test("sorts by type ascending", () => {
    const items = [sword(), shield(), potion(),];
    expect(sortItems(items, "type",).map((item,) => item.id),).toEqual(["shield", "potion", "sword",],);
  });
});

describe("filterItems", () => {
  const items = [sword(), potion(), shield({ equipped: "equipped", },),];

  test("matches type and rarity case-insensitively", () => {
    expect(filterItems(items, { type: "Weapon", },).map((item,) => item.id),).toEqual(["sword",],);
    expect(filterItems(items, { rarity: "RARE", },).map((item,) => item.id),).toEqual(["shield",],);
  });

  test("filters equipped and usable flags", () => {
    expect(filterItems(items, { equippedOnly: true, },).map((item,) => item.id),).toEqual(["shield",],);
    expect(filterItems(items, { usableOnly: true, },).map((item,) => item.id),).toEqual(["potion",],);
    expect(filterItems(items, { usableOnly: true, type: "weapon", },),).toEqual([],);
  });
});

describe("item flags and tags", () => {
  test("itemTags normalizes arrays, JSON strings, and comma lists", () => {
    expect(itemTags(sword({ tags: [" Rare ", "",], },),),).toEqual(["rare",],);
    expect(itemTags(sword({ tags: '["a","b"]', },),),).toEqual(["a", "b",],);
    expect(itemTags(sword({ tags: "a, b", },),),).toEqual(["a", "b",],);
    expect(itemTags(sword({ tags: "not json", },),),).toEqual(["not json",],);
    expect(itemTags(sword(),),).toEqual([],);
  });

  test("isItemEquipped accepts true and the equipped marker only", () => {
    expect(isItemEquipped(sword({ equipped: true, },),),).toBe(true,);
    expect(isItemEquipped(sword({ equipped: "equipped", },),),).toBe(true,);
    expect(isItemEquipped(sword({ equipped: "false", },),),).toBe(false,);
    expect(isItemEquipped(sword(),),).toBe(false,);
  });

  test("isItemUsable covers consumables, tools, and the usable tag", () => {
    expect(isItemUsable(potion(),),).toBe(true,);
    expect(isItemUsable(sword({ itemType: "tool", },),),).toBe(true,);
    expect(isItemUsable(sword({ tags: ["usable",], },),),).toBe(true,);
    expect(isItemUsable(sword(),),).toBe(false,);
  });
});
