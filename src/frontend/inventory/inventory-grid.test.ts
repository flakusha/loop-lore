// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Inventory grid tests: sort/filter units plus fake-dom render behavior.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type FakeEl, installBattleDom, makeEl, query, } from "../tests/battle-fake-dom";
import {
  filterItems,
  type InventoryItem,
  isItemEquipped,
  isItemUsable,
  itemTags,
  renderInventoryGrid,
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

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

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

describe("renderInventoryGrid", () => {
  test("renders grid slots sorted with stack counts and selection", () => {
    const root = makeEl("div",);
    const seen: string[] = [];
    renderInventoryGrid(root as unknown as HTMLElement, [sword(), potion(),], {
      onSelect: (id,) => {
        seen.push(id,);
      },
    },);

    expect(root.className,).toBe("inventory-grid",);
    expect(root.children.map((child,) => child.getAttribute("data-item-id",)),).toEqual([
      "potion",
      "sword",
    ],);

    // Quantity badge only on stacks: potion ×3, sword has none.
    expect(
      query(root, `[data-item-id="potion"]`,)?.children.some((child,) =>
        child.getAttribute("data-slot-part",) === "quantity" && child.textContent === "×3"
      ),
    ).toBe(true,);

    expect(
      query(root, `[data-item-id="sword"]`,)?.children.some((child,) =>
        child.getAttribute("data-slot-part",) === "quantity"
      ),
    ).toBe(false,);

    query(root, `[data-item-id="sword"]`,)?.click();
    expect(seen,).toEqual(["sword",],);
  });

  test("renders list view with meta line and equipped badge", () => {
    const root = makeEl("div",);
    renderInventoryGrid(root as unknown as HTMLElement, [shield({ equipped: true, },),], {
      view: "list",
      selectedId: "shield",
    },);

    expect(root.className,).toBe("inventory-list",);
    const slot = query(root, `[data-item-id="shield"]`,) as FakeEl | null;
    expect(slot?.className.includes("selected",),).toBe(true,);
    expect(slot?.className.includes("equipped",),).toBe(true,);
    expect(slot?.children.some((child,) => child.getAttribute("data-slot-part",) === "meta"),).toBe(true,);
    expect(
      slot?.children.some((child,) =>
        child.getAttribute("data-slot-part",) === "equipped" && child.textContent === "Equipped"
      ),
    ).toBe(true,);
  });

  test("renders empty state and applies filters", () => {
    const root = makeEl("div",);
    renderInventoryGrid(root as unknown as HTMLElement, [sword(),], { filter: { type: "armor", }, },);
    expect(root.children[0]?.className,).toBe("inventory-empty",);
    expect(root.children[0]?.textContent,).toBe("No items to display.",);
  });
});
