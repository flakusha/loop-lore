// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import * as BattleIndex from "./index.ts";

describe("battle index exports", () => {
  test("exports applyMoraleModifier function", () => {
    expect(typeof BattleIndex.applyMoraleModifier).toBe("function");
  });

  test("exports calculateEffectiveStats function", () => {
    expect(typeof BattleIndex.calculateEffectiveStats).toBe("function");
  });

  test("exports createMoraleState function", () => {
    expect(typeof BattleIndex.createMoraleState).toBe("function");
  });
});