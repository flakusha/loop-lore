// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { getCombatDC, } from "./dc.ts";

describe("getCombatDC", () => {
  test("disarm scales 1:1 with target level", () => {
    expect(getCombatDC("disarm", 10,).value,).toBe(20,);
    expect(getCombatDC("disarm", 0,).value,).toBe(10,);
    expect(getCombatDC("disarm",).value,).toBe(20,);
  });

  test("shove uses half level rounded down", () => {
    expect(getCombatDC("shove", 10,).value,).toBe(15,);
    expect(getCombatDC("shove", 11,).value,).toBe(15,);
    expect(getCombatDC("shove", 1,).value,).toBe(10,);
  });
  test("unknown action falls through and returns undefined", () => {
    expect(getCombatDC("snipe" as "aim", 10,),).toBeUndefined();
  });

  test("grapple scales 1:1 with target level", () => {
    const dc = getCombatDC("grapple", 6,);
    expect(dc,).toEqual({ name: "Grapple", value: 16, description: "DC to grapple opponent", },);
  });

  test("escape_grapple uses half level rounded down", () => {
    const dc = getCombatDC("escape_grapple", 7,);
    expect(dc,).toEqual({ name: "Escape Grapple", value: 13, description: "DC to escape grapple", },);
  });

  test("aim scales 1:1 with target level", () => {
    const dc = getCombatDC("aim", 4,);
    expect(dc,).toEqual({ name: "Aim", value: 14, description: "DC to aim for weak spot", },);
  });

  test("each action has a distinct name and description", () => {
    expect(getCombatDC("disarm", 5,).name,).toBe("Disarm",);
    expect(getCombatDC("shove", 5,).description,).toBe("DC to shove opponent",);
  });
});
