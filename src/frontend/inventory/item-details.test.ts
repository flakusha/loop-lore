// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Item details tests: metadata decoding plus fake-dom panel behavior.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type FakeEl, installBattleDom, makeEl, } from "../tests/battle-fake-dom";
import type { InventoryItem, } from "./inventory-grid";
import { type ItemDetailsActions, itemStatEntries, renderItemDetails, } from "./item-details";

const sword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "sword",
  name: "Iron Sword",
  itemType: "weapon",
  rarity: "common",
  description: "A sturdy iron sword.",
  quantity: 1,
  value: 50,
  weight: 3.5,
  metadata: { stats: { damage: "1d8 + 2", }, effects: ["bleed",], },
  ...overrides,
});

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

/** Find a child part by its `data-details-part` marker. */
const part = (root: FakeEl, name: string,): FakeEl | undefined =>
  root.children.find((child,) => child.getAttribute("data-details-part",) === name);

describe("itemStatEntries", () => {
  test("flattens stats records and effect lists", () => {
    const entries = itemStatEntries(sword(),);
    expect(entries,).toEqual([
      { label: "damage", value: "1d8 + 2", },
      { label: "effects", value: "bleed", },
    ],);
  });

  test("parses JSON-string metadata and returns [] for junk", () => {
    expect(itemStatEntries(sword({ metadata: '{"stats":{"crit":"5%"}}', },),),).toEqual([
      { label: "crit", value: "5%", },
    ],);

    expect(itemStatEntries(sword({ metadata: "not json", },),),).toEqual([],);
    expect(itemStatEntries(sword({ metadata: null, },),),).toEqual([],);
  });
});

describe("renderItemDetails", () => {
  test("renders empty state when nothing is selected", () => {
    const root = makeEl("div",);
    renderItemDetails(root as unknown as HTMLElement, null,);
    expect(part(root, "empty",)?.textContent,).toBe("Select an item to see details.",);
  });

  test("renders facts, description, stats, and equip/drop callbacks", () => {
    const root = makeEl("div",);
    const seen: string[] = [];
    const actions: ItemDetailsActions = {
      onEquip: (id,) => {
        seen.push(`equip:${id}`,);
      },
      onDrop: (id,) => {
        seen.push(`drop:${id}`,);
      },
    };

    renderItemDetails(root as unknown as HTMLElement, sword(), actions,);

    expect(part(root, "title",)?.textContent,).toBe("Iron Sword",);
    expect(part(root, "facts",)?.textContent?.includes("Type: weapon",),).toBe(true,);
    expect(part(root, "facts",)?.textContent?.includes("Value: 50g",),).toBe(true,);
    expect(part(root, "description",)?.textContent,).toBe("A sturdy iron sword.",);
    expect(part(root, "stats",)?.children[0]?.children.map((row,) => row.textContent),).toEqual([
      "damage: 1d8 + 2",
      "effects: bleed",
    ],);

    const buttons = part(root, "actions",)?.children ?? [];
    expect(buttons.map((button,) => button.textContent),).toEqual(["Equip", "Drop",],);
    buttons[0]?.click();
    buttons[1]?.click();
    expect(seen,).toEqual(["equip:sword", "drop:sword",],);
  });

  test("shows Unequip for equipped rows and Use only for usable rows", () => {
    const equipped = makeEl("div",);
    renderItemDetails(equipped as unknown as HTMLElement, sword({ equipped: "equipped", },), {
      onUnequip: () => {},
      onUse: () => {},
    },);

    expect(part(equipped, "actions",)?.children.map((button,) => button.textContent),).toEqual(["Unequip",],);

    const potion = makeEl("div",);
    const seen: string[] = [];
    renderItemDetails(
      potion as unknown as HTMLElement,
      sword({ id: "potion", itemType: "consumable", equipped: null, },),
      {
        onUse: (id,) => {
          seen.push(id,);
        },
      },
    );

    const buttons = part(potion, "actions",)?.children ?? [];
    expect(buttons.map((button,) => button.textContent),).toEqual(["Use",],);
    buttons[0]?.click();
    expect(seen,).toEqual(["potion",],);
  });
});
