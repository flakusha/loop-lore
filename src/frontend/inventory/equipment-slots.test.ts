// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Equipment slots tests: slot mapping units plus fake-dom render behavior.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type FakeEl, installBattleDom, makeEl, query, } from "../tests/battle-fake-dom";
import {
  EQUIPMENT_SLOTS,
  loadoutBySlot,
  renderEquipmentSlots,
  slotForItem,
} from "./equipment-slots";
import type { InventoryItem, } from "./inventory-grid";

const sword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "sword",
  name: "Iron Sword",
  itemType: "weapon",
  rarity: "common",
  quantity: 1,
  equipped: "equipped",
  ...overrides,
});

const helm = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "helm",
  name: "Iron Helm",
  itemType: "armor",
  rarity: "uncommon",
  quantity: 1,
  equipped: "equipped",
  metadata: { slot: "head", },
  ...overrides,
});

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

describe("slotForItem", () => {
  test("maps weapon to weapon and ignores bad metadata overrides", () => {
    expect(slotForItem(sword(),),).toBe("weapon",);
    expect(slotForItem(sword({ itemType: "WAND", },),),).toBe("accessory",);
    expect(slotForItem(sword({ metadata: { slot: "nope", }, },),),).toBe("weapon",);
    expect(slotForItem(sword({ metadata: '{"slot":"shield"}', },),),).toBe("shield",);
    expect(slotForItem(sword({ metadata: "not json", },),),).toBe("weapon",);
    expect(slotForItem(sword({ metadata: '["slot"]', },),),).toBe("weapon",);
  });

  test("explicit metadata.slot wins over the item-type fallback", () => {
    expect(slotForItem(helm(),),).toBe("head",);
    expect(slotForItem(sword({ metadata: { slot: "shield", }, },),),).toBe("shield",);
  });
});

describe("loadoutBySlot", () => {
  test("groups rows by slot with equipped rows winning ties", () => {
    const loadout = loadoutBySlot([
      sword({ equipped: null, },),
      sword({ id: "sword-2", name: "Steel Sword", },),
    ],);

    expect(loadout["weapon"]?.id,).toBe("sword-2",);
    expect(loadoutBySlot([helm(), sword(),],)["head"]?.id,).toBe("helm",);
  });
});

describe("renderEquipmentSlots", () => {
  test("renders all eight slots with names, stats tooltip, and unequip button", () => {
    const root = makeEl("div",);
    const seen: string[] = [];
    renderEquipmentSlots(root as unknown as HTMLElement, [
      sword({ metadata: { stats: { damage: "1d8", }, }, },),
      helm(),
    ], {
      onUnequip: (id,) => {
        seen.push(id,);
      },
    },);

    expect(root.className,).toBe("equipment-loadout",);
    expect(root.children.map((child,) => child.getAttribute("data-equip-slot",)),).toEqual([
      ...EQUIPMENT_SLOTS,
    ],);

    const weapon = query(root, '[data-equip-slot="weapon"]',) as FakeEl | null;
    const weaponName = weapon?.children.find((child,) => child.getAttribute("data-slot-part",) === "item");
    expect(weaponName?.textContent,).toBe("Iron Sword",);
    expect(weaponName?.getAttribute("title",),).toContain("damage",);
    const unequip = weapon?.children.find((child,) => child.getAttribute("data-slot-action",) === "unequip");
    expect(unequip?.textContent,).toBe("Unequip",);
    unequip?.click();
    expect(seen,).toEqual(["sword",],);

    const legs = query(root, '[data-equip-slot="legs"]',) as FakeEl | null;
    expect(legs?.className.includes("empty",),).toBe(true,);
    expect(legs?.children.find((child,) => child.getAttribute("data-slot-part",) === "item")?.textContent,).toBe(
      "Empty",
    );
  });

  test("equippable-but-unequipped rows get an equip button; no callbacks means no buttons", () => {
    const root = makeEl("div",);
    const seen: string[] = [];
    renderEquipmentSlots(root as unknown as HTMLElement, [sword({ equipped: null, },),], {
      onEquip: (id,) => {
        seen.push(id,);
      },
    },);

    const weapon = query(root, '[data-equip-slot="weapon"]',) as FakeEl | null;
    const equip = weapon?.children.find((child,) => child.getAttribute("data-slot-action",) === "equip");
    expect(equip?.textContent,).toBe("Equip",);
    equip?.click();
    expect(seen,).toEqual(["sword",],);

    const bare = makeEl("div",);
    renderEquipmentSlots(bare as unknown as HTMLElement, [sword(),],);
    const bareWeapon = query(bare, '[data-equip-slot="weapon"]',) as FakeEl | null;
    expect(bareWeapon?.children.some((child,) => child.tagName === "button"),).toBe(false,);
  });
});
