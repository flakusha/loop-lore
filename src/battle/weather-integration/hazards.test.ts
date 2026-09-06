// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import { generateEnvironmentalHazard, } from "./hazards.ts";

const originalRandom = Math.random;
afterEach(() => {
  Math.random = originalRandom;
},);

describe("generateEnvironmentalHazard", () => {
  test("storm with lucky roll yields a lightning strike", () => {
    Math.random = () => 0;
    const hazard = generateEnvironmentalHazard("open", "storm",);
    expect(hazard,).not.toBeNull();
    expect(hazard,).toMatchObject({
      name: "Lightning Strike",
      damagePerTurn: 20,
      area: "single",
      duration: 1,
      avoidable: true,
      avoidanceDC: 15,
    },);
    expect(typeof hazard?.id,).toBe("string",);
  });

  test("storm with unlucky roll on safe terrain yields nothing", () => {
    Math.random = () => 0.999;
    expect(generateEnvironmentalHazard("open", "storm",),).toBeNull();
  });

  test("heatwave with lucky roll yields heat exhaustion", () => {
    Math.random = () => 0;
    const hazard = generateEnvironmentalHazard("desert", "heatwave",);
    expect(hazard,).toMatchObject({ name: "Heat Exhaustion", damagePerTurn: 5, avoidanceDC: 12, duration: 3, },);
  });

  test("swamp terrain with clear skies yields toxic gas", () => {
    Math.random = () => 0;
    const hazard = generateEnvironmentalHazard("swamp", "clear",);
    expect(hazard,).toMatchObject({ name: "Toxic Gas", damagePerTurn: 8, area: "area", avoidanceDC: 13, },);
  });

  test("dungeon terrain with clear skies yields a trap", () => {
    Math.random = () => 0;
    const hazard = generateEnvironmentalHazard("dungeon", "clear",);
    expect(hazard,).toMatchObject({ name: "Trap", damagePerTurn: 15, avoidanceDC: 14, },);
  });

  test("safe terrain and weather yield nothing even on lucky rolls", () => {
    Math.random = () => 0;
    expect(generateEnvironmentalHazard("open", "clear",),).toBeNull();
    expect(generateEnvironmentalHazard("urban", "wind",),).toBeNull();
  });

  test("each generated hazard carries a unique id", () => {
    Math.random = () => 0;
    const first = generateEnvironmentalHazard("open", "storm",);
    const second = generateEnvironmentalHazard("open", "storm",);
    expect(first?.id,).not.toBe(second?.id,);
  });
});
