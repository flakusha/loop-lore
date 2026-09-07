// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";
import {
  type CombatWeather,
  type EnvironmentalModifier,
  getCombatWeatherModifiers,
} from "./weather";

describe("getCombatWeatherModifiers", () => {
  test("clear returns no modifiers", () => {
    const modifiers = getCombatWeatherModifiers("clear",);
    expect(modifiers,).toHaveLength(0,);
  });

  test("snow returns no modifiers", () => {
    const modifiers = getCombatWeatherModifiers("snow",);
    expect(modifiers,).toHaveLength(0,);
  });

  test("rain returns accuracy and fire modifiers", () => {
    const modifiers = getCombatWeatherModifiers("rain",);
    expect(modifiers,).toHaveLength(2,);
    expect(modifiers.map(m => m.id),).toContain("rain_accuracy",);
    expect(modifiers.map(m => m.id),).toContain("rain_fire",);
  });

  test("rain accuracy modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("rain",);
    const accuracy = modifiers.find(m => m.id === "rain_accuracy");
    expect(accuracy,).toBeDefined();
    expect(accuracy!.source,).toBe("weather",);
    expect(accuracy!.affectedStat,).toBe("accuracy",);
    expect(accuracy!.value,).toBe(-10,);
    expect(accuracy!.isPercentage,).toBe(false,);
    expect(accuracy!.duration,).toBe(0,);
    expect(accuracy!.description,).toBe("Rain reduces accuracy",);
  });

  test("rain fire modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("rain",);
    const fire = modifiers.find(m => m.id === "rain_fire");
    expect(fire,).toBeDefined();
    expect(fire!.affectedStat,).toBe("magicAttack",);
    expect(fire!.value,).toBe(-20,);
    expect(fire!.isPercentage,).toBe(true,);
    expect(fire!.duration,).toBe(0,);
    expect(fire!.description,).toBe("Rain weakens fire magic",);
  });

  test("storm returns accuracy and speed modifiers", () => {
    const modifiers = getCombatWeatherModifiers("storm",);
    expect(modifiers,).toHaveLength(2,);
    expect(modifiers.map(m => m.id),).toContain("storm_accuracy",);
    expect(modifiers.map(m => m.id),).toContain("storm_speed",);
  });

  test("storm accuracy modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("storm",);
    const accuracy = modifiers.find(m => m.id === "storm_accuracy");
    expect(accuracy,).toBeDefined();
    expect(accuracy!.affectedStat,).toBe("accuracy",);
    expect(accuracy!.value,).toBe(-20,);
    expect(accuracy!.isPercentage,).toBe(false,);
    expect(accuracy!.duration,).toBe(0,);
    expect(accuracy!.description,).toBe("Storm greatly reduces accuracy",);
  });

  test("storm speed modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("storm",);
    const speed = modifiers.find(m => m.id === "storm_speed");
    expect(speed,).toBeDefined();
    expect(speed!.affectedStat,).toBe("speed",);
    expect(speed!.value,).toBe(-15,);
    expect(speed!.isPercentage,).toBe(false,);
    expect(speed!.duration,).toBe(0,);
    expect(speed!.description,).toBe("Storm hampers movement",);
  });

  test("fog returns accuracy and dodge modifiers", () => {
    const modifiers = getCombatWeatherModifiers("fog",);
    expect(modifiers,).toHaveLength(2,);
    expect(modifiers.map(m => m.id),).toContain("fog_accuracy",);
    expect(modifiers.map(m => m.id),).toContain("fog_dodge",);
  });

  test("fog accuracy modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("fog",);
    const accuracy = modifiers.find(m => m.id === "fog_accuracy");
    expect(accuracy,).toBeDefined();
    expect(accuracy!.affectedStat,).toBe("accuracy",);
    expect(accuracy!.value,).toBe(-15,);
    expect(accuracy!.isPercentage,).toBe(false,);
    expect(accuracy!.duration,).toBe(0,);
    expect(accuracy!.description,).toBe("Fog reduces visibility",);
  });

  test("fog dodge modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("fog",);
    const dodge = modifiers.find(m => m.id === "fog_dodge");
    expect(dodge,).toBeDefined();
    expect(dodge!.affectedStat,).toBe("dodgeChance",);
    expect(dodge!.value,).toBe(10,);
    expect(dodge!.isPercentage,).toBe(false,);
    expect(dodge!.duration,).toBe(0,);
    expect(dodge!.description,).toBe("Fog provides concealment",);
  });

  test("wind returns ranged modifier", () => {
    const modifiers = getCombatWeatherModifiers("wind",);
    expect(modifiers,).toHaveLength(1,);
    expect(modifiers.map(m => m.id),).toContain("wind_ranged",);
  });

  test("wind ranged modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("wind",);
    const ranged = modifiers.find(m => m.id === "wind_ranged");
    expect(ranged,).toBeDefined();
    expect(ranged!.affectedStat,).toBe("accuracy",);
    expect(ranged!.value,).toBe(-10,);
    expect(ranged!.isPercentage,).toBe(false,);
    expect(ranged!.duration,).toBe(0,);
    expect(ranged!.description,).toBe("Wind affects ranged attacks",);
  });

  test("heatwave returns stamina modifier", () => {
    const modifiers = getCombatWeatherModifiers("heatwave",);
    expect(modifiers,).toHaveLength(1,);
    expect(modifiers.map(m => m.id),).toContain("heat_stamina",);
  });

  test("heatwave stamina modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("heatwave",);
    const stamina = modifiers.find(m => m.id === "heat_stamina");
    expect(stamina,).toBeDefined();
    expect(stamina!.affectedStat,).toBe("stamina",);
    expect(stamina!.value,).toBe(-20,);
    expect(stamina!.isPercentage,).toBe(true,);
    expect(stamina!.duration,).toBe(0,);
    expect(stamina!.description,).toBe("Heat drains stamina faster",);
  });

  test("cold_snap returns speed and attack modifiers", () => {
    const modifiers = getCombatWeatherModifiers("cold_snap",);
    expect(modifiers,).toHaveLength(2,);
    expect(modifiers.map(m => m.id),).toContain("cold_speed",);
    expect(modifiers.map(m => m.id),).toContain("cold_attack",);
  });

  test("cold_snap speed modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("cold_snap",);
    const speed = modifiers.find(m => m.id === "cold_speed");
    expect(speed,).toBeDefined();
    expect(speed!.affectedStat,).toBe("speed",);
    expect(speed!.value,).toBe(-10,);
    expect(speed!.isPercentage,).toBe(false,);
    expect(speed!.duration,).toBe(0,);
    expect(speed!.description,).toBe("Cold slows movement",);
  });

  test("cold_snap attack modifier has correct values", () => {
    const modifiers = getCombatWeatherModifiers("cold_snap",);
    const attack = modifiers.find(m => m.id === "cold_attack");
    expect(attack,).toBeDefined();
    expect(attack!.affectedStat,).toBe("attack",);
    expect(attack!.value,).toBe(-5,);
    expect(attack!.isPercentage,).toBe(false,);
    expect(attack!.duration,).toBe(0,);
    expect(attack!.description,).toBe("Cold stiffens muscles",);
  });
});

describe("EnvironmentalModifier interface", () => {
  test("modifier structure is correct", () => {
    const modifier: EnvironmentalModifier = {
      id: "test",
      source: "weather",
      affectedStat: "attack",
      value: 5,
      isPercentage: false,
      duration: 3,
      description: "Test modifier",
    };
    expect(modifier.id,).toBe("test",);
    expect(modifier.source,).toBe("weather",);
    expect(modifier.affectedStat,).toBe("attack",);
    expect(modifier.value,).toBe(5,);
    expect(modifier.isPercentage,).toBe(false,);
    expect(modifier.duration,).toBe(3,);
    expect(modifier.description,).toBe("Test modifier",);
  });
});

describe("CombatWeather", () => {
  test("includes all weather conditions", () => {
    const conditions: CombatWeather[] = [
      "clear",
      "rain",
      "storm",
      "snow",
      "fog",
      "wind",
      "heatwave",
      "cold_snap",
    ];
    for (const condition of conditions) {
      expect(typeof condition,).toBe("string",);
    }
  });
});
