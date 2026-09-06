// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createMoraleState, } from "../integration-schemas/morale.ts";
import { processMoraleBreak, } from "./morale.ts";

describe("processMoraleBreak", () => {
  test("broken morale reports break with three effects", () => {
    const state = createMoraleState("c1", 10,);
    expect(state.level,).toBe("broken",);
    const result = processMoraleBreak(state,);
    expect(result.broke,).toBe(true,);
    expect(result.effects,).toEqual([
      "Target is panicking!",
      "Target may flee or surrender!",
      "Target suffers -20 to all rolls!",
    ],);
  });

  test("shaken morale reports no break with two effects", () => {
    const state = createMoraleState("c1", 30,);
    expect(state.level,).toBe("shaken",);
    const result = processMoraleBreak(state,);
    expect(result.broke,).toBe(false,);
    expect(result.effects,).toEqual([
      "Target is shaken!",
      "Target suffers -10 to attack rolls!",
    ],);
  });

  test("steady morale reports no break and no effects", () => {
    const result = processMoraleBreak(createMoraleState("c1", 50,),);
    expect(result,).toEqual({ broke: false, effects: [], },);
  });

  test("confident and inspired morale report no break and no effects", () => {
    expect(processMoraleBreak(createMoraleState("c1", 70,),),).toEqual({ broke: false, effects: [], },);
    expect(processMoraleBreak(createMoraleState("c1", 90,),),).toEqual({ broke: false, effects: [], },);
  });
});
