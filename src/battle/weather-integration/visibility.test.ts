// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { calculateVisibility, } from "./visibility.ts";

describe("calculateVisibility", () => {
  test("base visibility per weather at noon", () => {
    expect(calculateVisibility("clear", 12,),).toBe(100,);
    expect(calculateVisibility("rain", 12,),).toBe(70,);
    expect(calculateVisibility("storm", 12,),).toBe(40,);
    expect(calculateVisibility("snow", 12,),).toBe(60,);
    expect(calculateVisibility("fog", 12,),).toBe(30,);
    expect(calculateVisibility("wind", 12,),).toBe(80,);
    expect(calculateVisibility("heatwave", 12,),).toBe(90,);
    expect(calculateVisibility("cold_snap", 12,),).toBe(85,);
  });

  test("night halves visibility", () => {
    expect(calculateVisibility("clear", 22,),).toBe(50,);
    expect(calculateVisibility("rain", 0,),).toBe(35,);
    expect(calculateVisibility("fog", 3,),).toBe(15,);
  });

  test("dawn and dusk scale visibility to 70%", () => {
    expect(calculateVisibility("clear", 19,),).toBe(70,);
    expect(calculateVisibility("clear", 6,),).toBe(70,);
    expect(calculateVisibility("clear", 7,),).toBe(70,);
    expect(calculateVisibility("clear", 18,),).toBe(70,);
  });

  test("day boundaries keep full visibility", () => {
    expect(calculateVisibility("clear", 8,),).toBe(100,);
    expect(calculateVisibility("clear", 17,),).toBe(100,);
  });

  test("night boundary starts at 20:00", () => {
    expect(calculateVisibility("clear", 20,),).toBe(50,);
    expect(calculateVisibility("wind", 5,),).toBe(40,);
  });
});
