// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";
import {
  categoryToType,
  categoryToSlot,
  toEquipmentItem,
  type EquipmentItem,
  type EquipmentSource,
  type ItemType,
} from "./item-mapping";

describe("categoryToType", () => {
  test("maps weapon to weapon", () => {
    expect(categoryToType("weapon",)).toBe("weapon");
  });

  test("maps armor to armor", () => {
    expect(categoryToType("armor",)).toBe("armor");
  });

  test("maps consumable to consumable", () => {
    expect(categoryToType("consumable",)).toBe("consumable");
  });

  test("maps material to material", () => {
    expect(categoryToType("material",)).toBe("material");
  });

  test("maps key_item to quest", () => {
    expect(categoryToType("key_item",)).toBe("quest");
  });

  test("maps quest_item to quest", () => {
    expect(categoryToType("quest_item",)).toBe("quest");
  });

  test("maps tool to accessory", () => {
    expect(categoryToType("tool",)).toBe("accessory");
  });

  test("maps container to accessory", () => {
    expect(categoryToType("container",)).toBe("accessory");
  });

  test("maps treasure to accessory", () => {
    expect(categoryToType("treasure",)).toBe("accessory");
  });

  test("maps book to accessory", () => {
    expect(categoryToType("book",)).toBe("accessory");
  });

  test("maps artifact to accessory", () => {
    expect(categoryToType("artifact",)).toBe("accessory");
  });

  test("maps misc to accessory", () => {
    expect(categoryToType("misc",)).toBe("accessory");
  });

  test("maps other to accessory", () => {
    expect(categoryToType("other",)).toBe("accessory");
  });
});

describe("categoryToSlot", () => {
  test("maps weapon to weapon slot", () => {
    expect(categoryToSlot("weapon",)).toBe("weapon");
  });

  test("maps armor to armor slot", () => {
    expect(categoryToSlot("armor",)).toBe("armor");
  });

  test("consumable has no slot", () => {
    expect(categoryToSlot("consumable",)).toBeUndefined();
  });

  test("material has no slot", () => {
    expect(categoryToSlot("material",)).toBeUndefined();
  });

  test("key_item has no slot", () => {
    expect(categoryToSlot("key_item",)).toBeUndefined();
  });

  test("quest_item has no slot", () => {
    expect(categoryToSlot("quest_item",)).toBeUndefined();
  });

  test("tool has no slot", () => {
    expect(categoryToSlot("tool",)).toBeUndefined();
  });

  test("container has no slot", () => {
    expect(categoryToSlot("container",)).toBeUndefined();
  });

  test("treasure has no slot", () => {
    expect(categoryToSlot("treasure",)).toBeUndefined();
  });

  test("book has no slot", () => {
    expect(categoryToSlot("book",)).toBeUndefined();
  });

  test("artifact has no slot", () => {
    expect(categoryToSlot("artifact",)).toBeUndefined();
  });

  test("misc has no slot", () => {
    expect(categoryToSlot("misc",)).toBeUndefined();
  });

  test("other has no slot", () => {
    expect(categoryToSlot("other",)).toBeUndefined();
  });
});

describe("toEquipmentItem", () => {
  const baseSource: EquipmentSource = {
    id: "itm-1",
    name: "Iron Sword",
    description: "A sturdy blade.",
    category: "weapon" as const,
    rarity: "rare" as const,
    properties: {},
  };

  test("builds equipment item with default properties", () => {
    const item = toEquipmentItem(baseSource,);
    expect(item.id).toBe("itm-1",);
    expect(item.name).toBe("Iron Sword");
    expect(item.type).toBe("weapon");
    expect(item.slot).toBe("weapon");
    expect(item.rarity).toBe("rare");
    expect(item.modifiers).toHaveLength(0);
    expect(item.durability).toBe(100);
    expect(item.maxDurability).toBe(100);
    expect(item.equipped).toBe(false);
    expect(item.requiredLevel).toBe(1);
    expect(item.requiredStats).toBeUndefined();
    expect(item.description).toBe("A sturdy blade.");
  });

  test("maps damage property to attack modifier", () => {
    const item = toEquipmentItem({
      ...baseSource,
      properties: { damage: 8, },
    },);
    expect(item.modifiers).toContainEqual({ stat: "attack", value: 8 });
  });

  test("maps ac property to defense modifier", () => {
    const item = toEquipmentItem({
      ...baseSource,
      properties: { ac: 5, },
    },);
    expect(item.modifiers).toContainEqual({ stat: "defense", value: 5 });
  });

  test("maps bonus property to attack modifier", () => {
    const item = toEquipmentItem({
      ...baseSource,
      properties: { bonus: 3, },
    },);
    expect(item.modifiers).toContainEqual({ stat: "attack", value: 3 });
  });

  test("maps both damage and ac", () => {
    const item = toEquipmentItem({
      ...baseSource,
      properties: { damage: 4, ac: 2, },
    },);
    expect(item.modifiers).toContainEqual({ stat: "attack", value: 4 });
    expect(item.modifiers).toContainEqual({ stat: "defense", value: 2 });
  });

  test("maps requiredLevel from properties", () => {
    const item = toEquipmentItem({
      ...baseSource,
      properties: { requiredLevel: 10, },
    },);
    expect(item.requiredLevel).toBe(10,);
  });

  test("maps requiredStats from properties", () => {
    const item = toEquipmentItem({
      ...baseSource,
      properties: { requiredStats: { attack: 10 }, },
    },);
    expect(item.requiredStats).toEqual({ attack: 10 });
  });

  test("produces no modifiers for empty properties", () => {
    const item = toEquipmentItem({ ...baseSource, properties: {}, },);
    expect(item.modifiers).toHaveLength(0);
  });

  test("defaults requiredLevel to 1 when not specified", () => {
    const item = toEquipmentItem(baseSource,);
    expect(item.requiredLevel).toBe(1);
  });

  test("sets durability to 100 by default", () => {
    const item = toEquipmentItem(baseSource,);
    expect(item.durability).toBe(100);
    expect(item.maxDurability).toBe(100);
  });

  test("sets equipped to false by default", () => {
    const item = toEquipmentItem(baseSource,);
    expect(item.equipped).toBe(false);
  });
});