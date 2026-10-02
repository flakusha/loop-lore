// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin power-audit ranking tests (TASK-056).
 *
 * `rankItemPower` orders instances by
 * `(maxStatDelta + sum(drift) + maxDurability)`, resolves each instance's
 * definition by item id (never by name), and breaks ties deterministically.
 */
import { describe, expect, test, } from "bun:test";
import { ItemCategory, } from "../../db/enums";
import { rankItemPower, } from "./balance";
import type { ItemDefinition, ItemInstance, } from "./types";

function definition(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    worldId: "world-1",
    name: "Sword",
    description: "",
    category: ItemCategory.Weapon,
    rarity: "common",
    stackable: false,
    maxStack: 1,
    properties: {},
    value: 0,
    weight: 1,
    ...overrides,
  };
}

function instance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    worldItemId: "wi-1",
    itemId: "item-1",
    name: "Sword",
    description: "",
    category: ItemCategory.Weapon,
    rarity: "common",
    quantity: 1,
    properties: {},
    value: 0,
    weight: 1,
    visibility: "visible" as ItemInstance["visibility"],
    ...overrides,
  };
}

describe("rankItemPower", () => {
  const byId = new Map<string, ItemDefinition>([
    ["item-strong", definition({ properties: { effects: [{ kind: "stat_delta", stat: "damage", amount: 10 }] } })],
    ["item-plain", definition()],
  ]);

  test("orders by maxStatDelta + drift + maxDurability, strongest first", () => {
    const ranked = rankItemPower(byId, [
      instance({ worldItemId: "wi-plain", itemId: "item-plain", maxDurability: 10 }),
      instance({ worldItemId: "wi-strong", itemId: "item-strong", maxDurability: 20 }),
    ]);

    // strong: 10 stat + 0 drift + 20 dur = 30; plain: 0 + 0 + 10 = 10.
    expect(ranked.map((row) => row.worldItemId)).toEqual(["wi-strong", "wi-plain"]);
    expect(ranked[0]?.score).toBe(30);
  });

  test("counts accumulated drift toward the score", () => {
    const ranked = rankItemPower(byId, [
      instance({
        worldItemId: "wi-drifted",
        itemId: "item-plain",
        maxDurability: 0,
        properties: { drift: { statMultipliers: { damage: 0.3, speed: -0.2 }, battleUses: 1, lastDriftAt: "" } },
      }),
    ]);

    // abs(0.3) + abs(-0.2) = 0.5.
    expect(ranked[0]?.drift).toBeCloseTo(0.5, 5);
    expect(ranked[0]?.score).toBeCloseTo(0.5, 5);
  });

  test("a durability-only item outranks a drifted weaker item only by score", () => {
    const ranked = rankItemPower(byId, [
      instance({ worldItemId: "wi-durable", itemId: "item-plain", maxDurability: 100 }),
      instance({
        worldItemId: "wi-drift",
        itemId: "item-plain",
        maxDurability: 0,
        properties: { drift: { statMultipliers: { damage: 0.1 }, battleUses: 1, lastDriftAt: "" } },
      }),
    ]);

    expect(ranked[0]?.worldItemId).toBe("wi-durable");
    expect(ranked[0]?.score).toBe(100);
    expect(ranked[1]?.score).toBeCloseTo(0.1, 5);
  });

  test("breaks score ties deterministically by worldItemId", () => {
    const instances = [
      instance({ worldItemId: "wi-b", itemId: "item-plain", maxDurability: 5 }),
      instance({ worldItemId: "wi-a", itemId: "item-plain", maxDurability: 5 }),
    ];

    const first = rankItemPower(byId, instances).map((row) => row.worldItemId);
    const second = rankItemPower(byId, [...instances].reverse()).map((row) => row.worldItemId);

    expect(first).toEqual(["wi-a", "wi-b"]);
    expect(second).toEqual(first);
  });

  test("skips instances whose definition is not in the map", () => {
    const ranked = rankItemPower(byId, [
      instance({ worldItemId: "wi-orphan", itemId: "item-missing", maxDurability: 999 }),
    ]);

    // An unknown definition must not be ranked as if it had zero power.
    expect(ranked).toEqual([]);
  });

  test("does not conflate same-name items of different definitions", () => {
    const defs = new Map<string, ItemDefinition>([
      ["item-sword", definition({ category: ItemCategory.Weapon, properties: { effects: [{ kind: "stat_delta", stat: "damage", amount: 5 }] } })],
      ["item-bread", definition({ category: ItemCategory.Consumable, properties: {} })],
    ]);

    const ranked = rankItemPower(defs, [
      instance({ worldItemId: "wi-1", itemId: "item-bread", name: "Sword", maxDurability: 1 }),
      instance({ worldItemId: "wi-2", itemId: "item-sword", name: "Sword", maxDurability: 1 }),
    ]);

    // The bread instance must score from the bread definition (no effects).
    expect(ranked[0]?.worldItemId).toBe("wi-2");
    expect(ranked[1]?.maxStatDelta).toBe(0);
  });

  test("a malformed effects payload surfaces the parse error, not a score", () => {
    expect(() =>
      rankItemPower(new Map([["item-bad", definition({ properties: { effects: "nope" } })]]), [
        instance({ worldItemId: "wi-bad", itemId: "item-bad" }),
      ])
    ).toThrow("properties.effects must be an array");
  });
});
