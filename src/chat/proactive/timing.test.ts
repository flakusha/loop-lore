// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { isInQuietHours, } from "./timing";

/** Build a Date with the given hour + minute (local). */
function at(hour: number, minute = 0,): Date {
  const d = new Date(2026, 0, 1, hour, minute, 0, 0,);
  return d;
}

describe("isInQuietHours boundary semantics", () => {
  it("returns true at the inclusive start (22:00 in 22:00–07:00)", () => {
    expect(isInQuietHours("22:00", "07:00", at(22, 0,),),).toBe(true,);
  });

  it("returns false at the exclusive end (07:00 in 22:00–07:00)", () => {
    expect(isInQuietHours("22:00", "07:00", at(7, 0,),),).toBe(false,);
  });

  it("returns true mid-window (23:30 in 22:00–07:00)", () => {
    expect(isInQuietHours("22:00", "07:00", at(23, 30,),),).toBe(true,);
  });

  it("returns false at the exclusive end (17:00 in 09:00–17:00)", () => {
    expect(isInQuietHours("09:00", "17:00", at(17, 0,),),).toBe(false,);
  });

  it("returns true at the inclusive start (09:00 in 09:00–17:00)", () => {
    expect(isInQuietHours("09:00", "17:00", at(9, 0,),),).toBe(true,);
  });
});

describe("isInQuietHours general behavior", () => {
  it("returns false when start is null", () => {
    expect(isInQuietHours(null, "07:00", at(3, 0,),),).toBe(false,);
  });

  it("returns false when end is null", () => {
    expect(isInQuietHours("22:00", null, at(3, 0,),),).toBe(false,);
  });

  it("returns false outside same-day window (08:00 in 09:00–17:00)", () => {
    expect(isInQuietHours("09:00", "17:00", at(8, 0,),),).toBe(false,);
  });

  it("returns true after midnight in overnight window (02:00 in 22:00–07:00)", () => {
    expect(isInQuietHours("22:00", "07:00", at(2, 0,),),).toBe(true,);
  });

  it("returns true mid-window with minute precision (16:59 in 09:00–17:00)", () => {
    expect(isInQuietHours("09:00", "17:00", at(16, 59,),),).toBe(true,);
  });
});
