// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { calculateEffectiveStats, type CombatStats, type EquipmentModifier, } from "./stats.ts";

describe("stats", () => {
  const baseStats: CombatStats = {
    characterId: "char1",
    health: 50,
    maxHealth: 100,
    mana: 30,
    maxMana: 50,
    stamina: 20,
    maxStamina: 30,
    attack: 10,
    defense: 5,
    magicAttack: 8,
    magicDefense: 4,
    speed: 6,
    criticalChance: 15,
    dodgeChance: 10,
    accuracy: 80,
  };

  test("calculateEffectiveStats returns stats with defaults", () => {
    const result = calculateEffectiveStats(baseStats, []);
    expect(result.health).toBe(50);
    expect(result.maxHealth).toBe(100);
    expect(result.mana).toBe(30);
    expect(result.maxMana).toBe(50);
    expect(result.stamina).toBe(20);
    expect(result.maxStamina).toBe(30);
    expect(result.attack).toBe(10);
    expect(result.defense).toBe(5);
    expect(result.magicAttack).toBe(8);
    expect(result.magicDefense).toBe(4);
    expect(result.speed).toBe(6);
    expect(result.criticalChance).toBe(15);
    expect(result.dodgeChance).toBe(10);
    expect(result.accuracy).toBe(80);
  });

  test("calculateEffectiveStats applies equipment modifiers", () => {
    const modifiers: EquipmentModifier[] = [
      { stat: "attack", value: 5 },
      { stat: "defense", value: 3 },
    ];
    const result = calculateEffectiveStats(baseStats, modifiers);
    expect(result.attack).toBe(15);
    expect(result.defense).toBe(8);
  });

  test("calculateEffectiveStats clamps health to max", () => {
    const modifiers: EquipmentModifier[] = [{ stat: "health", value: 200 }];
    const result = calculateEffectiveStats(baseStats, modifiers);
    expect(result.health).toBe(baseStats.maxHealth);
  });

  test("calculateEffectiveStats clamps criticalChance to 100", () => {
    const modifiers: EquipmentModifier[] = [{ stat: "criticalChance", value: 200 }];
    const result = calculateEffectiveStats(baseStats, modifiers);
    expect(result.criticalChance).toBe(100);
  });

  test("calculateEffectiveStats ignores characterId modifier", () => {
    const modifiers: EquipmentModifier[] = [{ stat: "characterId" as any, value: 100 }];
    const result = calculateEffectiveStats(baseStats, modifiers);
    expect(result.characterId).toBe("char1");
  });

  test("calculateEffectiveStats ignores non-numeric stat", () => {
    const modifiers: EquipmentModifier[] = [{ stat: "characterId" as any, value: 100 }];
    const result = calculateEffectiveStats(baseStats, modifiers);
    expect(result).toBeDefined();
  });
});