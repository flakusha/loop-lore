/**
 * Battle ↔ world item mapping tests.
 *
 * Verifies `toEquipmentItem` derives an `EquipmentItem` from a world item
 * definition (category→slot/type, rarity, properties→modifiers).
 */
import { describe, expect, test, } from "bun:test";
import {
  categoryToSlot,
  categoryToType,
  toEquipmentItem,
} from "./items-integration";

describe("categoryToType", () => {
  test("maps weapon/armor directly", () => {
    expect(categoryToType("weapon",),).toBe("weapon",);
    expect(categoryToType("armor",),).toBe("armor",);
  });
  test("maps consumable/material", () => {
    expect(categoryToType("consumable",),).toBe("consumable",);
    expect(categoryToType("material",),).toBe("material",);
  });
  test("maps key/quest items to quest", () => {
    expect(categoryToType("key_item",),).toBe("quest",);
    expect(categoryToType("quest_item",),).toBe("quest",);
  });
  test("maps misc categories to accessory", () => {
    expect(categoryToType("book",),).toBe("accessory",);
    expect(categoryToType("artifact",),).toBe("accessory",);
    expect(categoryToType("other",),).toBe("accessory",);
  });
});

describe("categoryToSlot", () => {
  test("weapon/armor map to slots", () => {
    expect(categoryToSlot("weapon",),).toBe("weapon",);
    expect(categoryToSlot("armor",),).toBe("armor",);
  });
  test("non-equippable categories have no slot", () => {
    expect(categoryToSlot("consumable",),).toBeUndefined();
    expect(categoryToSlot("book",),).toBeUndefined();
  });
});

describe("toEquipmentItem", () => {
  const base = {
    id: "itm-1",
    name: "Iron Sword",
    description: "A sturdy blade.",
    category: "weapon" as const,
    rarity: "rare" as const,
  };

  test("builds equipment item from weapon definition", () => {
    const item = toEquipmentItem({
      ...base,
      properties: { damage: 8, },
    },);
    expect(item.type,).toBe("weapon",);
    expect(item.slot,).toBe("weapon",);
    expect(item.rarity,).toBe("rare",);
    expect(item.durability,).toBe(100,);
    expect(item.maxDurability,).toBe(100,);
    expect(item.requiredLevel,).toBe(1,);
    expect(item.equipped,).toBe(false,);
    expect(item.modifiers,).toContainEqual({ stat: "attack", value: 8, });
  });

  test("maps damage/bonus to attack and ac to defense", () => {
    const item = toEquipmentItem({
      ...base,
      category: "armor",
      properties: { ac: 5, bonus: 2, },
    },);
    expect(item.modifiers,).toContainEqual({ stat: "defense", value: 5, });
    expect(item.modifiers,).toContainEqual({ stat: "attack", value: 2, });
  });

  test("reads requiredLevel from properties", () => {
    const item = toEquipmentItem({
      ...base,
      properties: { damage: 4, requiredLevel: 10, },
    },);
    expect(item.requiredLevel,).toBe(10,);
  });

  test("produces no modifiers for empty properties", () => {
    const item = toEquipmentItem({ ...base, properties: {}, },);
    expect(item.modifiers,).toHaveLength(0,);
  });
});