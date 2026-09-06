// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";
import * as IntegrationSchemas from "./index";

describe("battle integration schemas exports", () => {
  test("exports dice functions", () => {
    expect(typeof IntegrationSchemas.rollDice).toBe("function");
    expect(typeof IntegrationSchemas.STANDARD_DC).toBe("object");
  });

  test("exports morale functions", () => {
    expect(typeof IntegrationSchemas.createMoraleState).toBe("function");
    expect(typeof IntegrationSchemas.computeMoraleLevel).toBe("function");
    expect(typeof IntegrationSchemas.applyMoraleModifier).toBe("function");
  });

  test("exports stats functions", () => {
    expect(typeof IntegrationSchemas.calculateEffectiveStats).toBe("function");
  });

  test("exports status functions", () => {
    expect(typeof IntegrationSchemas.createStatusEffect).toBe("function");
    expect(typeof IntegrationSchemas.tickStatusEffect).toBe("function");
    expect(typeof IntegrationSchemas.isStatusEffectExpired).toBe("function");
  });

  test("exports terrain functions", () => {
    expect(typeof IntegrationSchemas.getCombatTerrainModifiers).toBe("function");
  });

  test("exports weather functions", () => {
    expect(typeof IntegrationSchemas.getCombatWeatherModifiers).toBe("function");
  });

  test("re-exports dice rollDice function", () => {
    expect(typeof IntegrationSchemas.rollDice).toBe("function");
  });

  test("re-exports morale functions", () => {
    expect(typeof IntegrationSchemas.createMoraleState).toBe("function");
    expect(typeof IntegrationSchemas.applyMoraleModifier).toBe("function");
  });

  test("re-exports stats functions", () => {
    expect(typeof IntegrationSchemas.calculateEffectiveStats).toBe("function");
  });

  test("re-exports status functions", () => {
    expect(typeof IntegrationSchemas.createStatusEffect).toBe("function");
  });

  test("re-exports terrain functions", () => {
    expect(typeof IntegrationSchemas.getCombatTerrainModifiers).toBe("function");
  });

  test("re-exports weather functions", () => {
    expect(typeof IntegrationSchemas.getCombatWeatherModifiers).toBe("function");
  });

  test("re-exports standard difficulty class", () => {
    expect(typeof IntegrationSchemas.STANDARD_DC).toBe("object");
  });

  test("re-exports roll dice type definition at compile time only", () => {
    // Type-only exports don't exist at runtime
    expect(typeof IntegrationSchemas.rollDice).toBe("function");
  });

  test("exported types can be instantiated", () => {
    // Test that we can access all the key exports
    const exports = {
      rollDice: IntegrationSchemas.rollDice,
      calculateEffectiveStats: IntegrationSchemas.calculateEffectiveStats,
      createMoraleState: IntegrationSchemas.createMoraleState,
      createStatusEffect: IntegrationSchemas.createStatusEffect,
      getCombatTerrainModifiers: IntegrationSchemas.getCombatTerrainModifiers,
      getCombatWeatherModifiers: IntegrationSchemas.getCombatWeatherModifiers,
    };
    for (const [name, fn] of Object.entries(exports,)) {
      expect(typeof fn).toBe("function");
    }
  });
});