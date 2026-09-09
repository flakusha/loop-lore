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

  // ── Edge cases ──────────────────────────────────────────────

  test("morale at 31 refuses surrender (boundary)", () => {
    const result = calculateSurrenderChance(createMoraleState("t1", 31,), 100, 0,);
    expect(result,).toEqual({ surrenderChance: 0, canSurrender: false, },);
  });

  test("morale at 30 with zero health yields max low-morale bonus", () => {
    // (30-30)*2=0 + (100-0)*0.5=50 + 0 = 50 → rounded 50.
    const result = calculateSurrenderChance(createMoraleState("t1", 30,), 0, 0,);
    expect(result,).toEqual({ surrenderChance: 50, canSurrender: true, },);
  });

  test("zero health alone with high morale (50) refuses surrender", () => {
    // morale=50 > 30 → refuses before any health math.
    const result = calculateSurrenderChance(createMoraleState("t1", 50,), 0, 0,);
    expect(result,).toEqual({ surrenderChance: 0, canSurrender: false, },);
  });

  test("negative reputation has no effect (chance stays >= 0)", () => {
    // morale=30 → canSurrender=true; reputation<0 should not push below 0.
    const result = calculateSurrenderChance(createMoraleState("t1", 30,), -1000, 100,);
    expect(result.surrenderChance,).toBe(0,);
    expect(result.canSurrender,).toBe(true,);
  });

  test("morale below 0 is treated like 0 (no bonus)", () => {
    // morale=-50 → (30-(-50))*2 = 160; +50 from full health loss = 210, capped at 90.
    const result = calculateSurrenderChance(createMoraleState("t1", -50,), 0, 0,);
    expect(result.surrenderChance,).toBe(90,);
    expect(result.canSurrender,).toBe(true,);
  });

  test("healthPercent above 100 is clamped (no extra surrender)", () => {
    // (100-150)*0.5 = -25 → chance cannot drop below 0.
    const result = calculateSurrenderChance(createMoraleState("t1", 30,), 0, 150,);
    expect(result.surrenderChance,).toBe(0,);
    expect(result.canSurrender,).toBe(true,);
  });
});
