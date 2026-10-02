// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Item power budget tests.
 *
 * Covers the validator's precedence order, the drift clamp (a unique item's
 * unbounded rarity cap is still bounded by its category budget), and the
 * admin power-audit ranking.
 */
import { describe, expect, test, } from "bun:test";
import { ItemCategory, ItemRarity, } from "../../db/enums";
import {
  DRIFT_CAPS,
  driftCapFor,
  ITEM_POWER_BUDGETS,
  powerBudgetFor,
  validateItemPower,
} from "./balance";
import type { ItemDefinition, ItemInstance, } from "./types";

function definition(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    worldId: "world-1",
    name: "Sword",
    description: "",
    category: ItemCategory.Weapon,
    rarity: ItemRarity.Common,
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
    rarity: ItemRarity.Common,
    quantity: 1,
    properties: {},
    value: 0,
    weight: 1,
    visibility: "visible" as ItemInstance["visibility"],
    ...overrides,
  };
}

describe("validateItemPower", () => {
  test("rejects a stat_delta total above the category budget", () => {
    const def = definition({
      properties: {
        effects: [
          { kind: "stat_delta", stat: "damage", amount: 4 },
          { kind: "stat_delta", stat: "speed", amount: 3 },
        ],
      },
    });

    const result = validateItemPower(def);

    // Weapon budget is maxStatDelta 5; 4 + 3 = 7 exceeds it.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("statDelta");
    expect(result.reason).toContain("7");
  });

  test("counts negative stat_delta magnitudes, not signed sums", () => {
    const def = definition({
      properties: {
        effects: [
          { kind: "stat_delta", stat: "damage", amount: -4 },
          { kind: "stat_delta", stat: "speed", amount: -3 },
        ],
      },
    });

    // A signed sum would cancel to 0 and pass; magnitudes must not.
    expect(validateItemPower(def).ok).toBe(false);
  });

  test("reports statDelta before effectCount when both are exceeded", () => {
    const def = definition({
      properties: {
        effects: [
          { kind: "stat_delta", stat: "damage", amount: 99 },
          { kind: "on_use", action: "heal", payload: { amount: 1 } },
          { kind: "on_use", action: "buff", payload: { amount: 1 } },
          { kind: "on_use", action: "cleanse", payload: { amount: 1 } },
        ],
      },
    });

    const result = validateItemPower(def);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("statDelta");
  });

  test("rejects an effect count above the category budget", () => {
    const def = definition({
      properties: {
        effects: [
          { kind: "on_use", action: "heal", payload: {} },
          { kind: "on_use", action: "buff", payload: {} },
          { kind: "on_use", action: "cleanse", payload: {} },
        ],
      },
    });

    const result = validateItemPower(def);

    // Weapon budget is maxEffectCount 2, so the third effect trips the gate.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("effectCount");
  });

  test("a key item admits no effects at all", () => {
    const def = definition({
      category: ItemCategory.KeyItem,
      properties: { effects: [{ kind: "on_use", action: "heal", payload: {} }] },
    });

    const result = validateItemPower(def);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("effectCount");
  });

  test("skips durability and drift checks when no instance is supplied", () => {
    const def = definition();

    // A draft has no instance: an un-durable weapon draft is not over budget.
    expect(validateItemPower(def).ok).toBe(true);
  });

  test("rejects instance durability above the category budget", () => {
    const result = validateItemPower(definition(), instance({ maxDurability: 101 }));

    // Weapon budget is maxDurability 100.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("maxDurability");
  });

  test("accepts instance durability exactly at the budget", () => {
    expect(validateItemPower(definition(), instance({ maxDurability: 100 })).ok).toBe(true);
  });

  test("rejects per-stat drift above the category budget", () => {
    const result = validateItemPower(definition(), instance({
      properties: { drift: { statMultipliers: { damage: 0.2 }, battleUses: 1, lastDriftAt: "" } },
    }));

    // Weapon budget is maxDriftPct 0.15.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("drift");
    expect(result.reason).toContain("damage");
  });

  test("rejects negative drift beyond the budget by magnitude", () => {
    const result = validateItemPower(definition(), instance({
      properties: { drift: { statMultipliers: { damage: -0.5 }, battleUses: 1, lastDriftAt: "" } },
    }));

    expect(result.ok).toBe(false);
  });

  test("a unique item is still bounded by its category drift budget", () => {
    const unique = definition({ rarity: ItemRarity.Unique });
    const inst = instance({
      rarity: ItemRarity.Unique,
      properties: { drift: { statMultipliers: { damage: 0.9 }, battleUses: 3, lastDriftAt: "" } },
    });

    // The rarity cap is unbounded, but the category budget is not.
    expect(DRIFT_CAPS[ItemRarity.Unique]).toBe(Number.POSITIVE_INFINITY);
    expect(validateItemPower(unique, inst).ok).toBe(false);
  });

  test("per-rarity drift cap binds tighter than the category budget", () => {
    // Common weapons cap at 0.05 (rarity) below the 0.15 category ceiling.
    expect(driftCapFor(ItemRarity.Common, ItemCategory.Weapon)).toBe(0.05);
    // Unique items fall through to the category ceiling.
    expect(driftCapFor(ItemRarity.Unique, ItemCategory.Weapon)).toBe(0.15);
    // Book forbids drift outright.
    expect(driftCapFor(ItemRarity.Legendary, ItemCategory.Book)).toBe(0);
  });

  test("every category has a budget and an unknown category falls back", () => {
    for (const category of Object.values(ItemCategory,)) {
      expect(ITEM_POWER_BUDGETS[category]).toBeDefined();
    }
    expect(powerBudgetFor("not_a_category" as ItemCategory)).toBe(ITEM_POWER_BUDGETS[ItemCategory.Other]);
  });
});
