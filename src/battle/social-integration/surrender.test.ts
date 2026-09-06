// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createMoraleState, } from "../integration-schemas/morale.ts";
import { calculateSurrenderChance, } from "./surrender.ts";

describe("calculateSurrenderChance", () => {
  test("morale above 30 refuses surrender", () => {
    const result = calculateSurrenderChance(createMoraleState("t1", 50,), 100, 1,);
    expect(result,).toEqual({ surrenderChance: 0, canSurrender: false, },);
  });

  test("morale exactly 30 can surrender with zero base chance at full health", () => {
    const result = calculateSurrenderChance(createMoraleState("t1", 30,), 0, 100,);
    expect(result,).toEqual({ surrenderChance: 0, canSurrender: true, },);
  });

  test("low morale alone yields 40% chance", () => {
    const result = calculateSurrenderChance(createMoraleState("t1", 10,), 0, 100,);
    expect(result,).toEqual({ surrenderChance: 40, canSurrender: true, },);
  });

  test("low health adds half the missing health percent", () => {
    const full = calculateSurrenderChance(createMoraleState("t1", 10,), 0, 100,);
    const bloodied = calculateSurrenderChance(createMoraleState("t1", 10,), 0, 20,);
    expect(bloodied.surrenderChance - full.surrenderChance,).toBe(40,);
  });

  test("reputation adds 0.3 per point and rounds", () => {
    // (30-29)*2=2 + (100-99)*0.5=0.5 + 7*0.3=2.1 -> 4.6 -> 5
    const result = calculateSurrenderChance(createMoraleState("t1", 29,), 7, 99,);
    expect(result.surrenderChance,).toBe(5,);
  });

  test("chance caps at 90%", () => {
    const result = calculateSurrenderChance(createMoraleState("t1", 0,), 100, 0,);
    expect(result,).toEqual({ surrenderChance: 90, canSurrender: true, },);
  });
});
