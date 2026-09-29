// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { backoffMs, isInQuietHours, msUntilMidnight, msUntilQuietHoursEnd, } from "./timing";

/**
 * Build a Date with the given hour + minute (local).
 * @param hour
 * @param minute
 */
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

describe("isInQuietHours — minute precision and degenerate windows", () => {
  it("minute-precision start: 09:29 is out, 09:30 is in (09:30–17:00)", () => {
    expect(isInQuietHours("09:30", "17:00", at(9, 29,),),).toBe(false,);
    expect(isInQuietHours("09:30", "17:00", at(9, 30,),),).toBe(true,);
  });

  it("minute-precision end: 17:29 is in, 17:30 is out (09:00–17:30)", () => {
    expect(isInQuietHours("09:00", "17:30", at(17, 29,),),).toBe(true,);
    expect(isInQuietHours("09:00", "17:30", at(17, 30,),),).toBe(false,);
  });

  it("zero-length window (start === end) is never in quiet hours", () => {
    expect(isInQuietHours("09:00", "09:00", at(9, 0,),),).toBe(false,);
    expect(isInQuietHours("09:00", "09:00", at(10, 0,),),).toBe(false,);
  });
});

describe("backoffMs", () => {
  it("returns the base wait when backoffCount is 0", () => {
    expect(backoffMs(1000, 0,),).toBe(1000,);
  });

  it("doubles the wait per unanswered message", () => {
    expect(backoffMs(1000, 1,),).toBe(2000,);
    expect(backoffMs(1000, 5,),).toBe(32000,);
  });

  it("scales exponential growth with large counts", () => {
    expect(backoffMs(500, 10,),).toBe(512000,);
    expect(backoffMs(250, 4,),).toBe(4000,);
  });

  it("returns 0 for a zero base", () => {
    expect(backoffMs(0, 3,),).toBe(0,);
  });
});

describe("msUntilQuietHoursEnd", () => {
  it("returns 0 when end is null", () => {
    expect(msUntilQuietHoursEnd(null, at(10, 0,),),).toBe(0,);
  });

  it("returns the remaining time later the same day", () => {
    expect(msUntilQuietHoursEnd("17:00", at(10, 0,),),).toBe(7 * 60 * 60 * 1000,);
  });

  it("rolls to the next day when end equals now", () => {
    expect(msUntilQuietHoursEnd("10:00", at(10, 0,),),).toBe(24 * 60 * 60 * 1000,);
  });

  it("rolls to the next day when end is earlier than now", () => {
    // 10:00 → next-day 08:00 is 22 hours.
    expect(msUntilQuietHoursEnd("08:00", at(10, 0,),),).toBe(22 * 60 * 60 * 1000,);
  });

  it("handles minute precision", () => {
    expect(msUntilQuietHoursEnd("17:30", at(17, 0,),),).toBe(30 * 60 * 1000,);
  });
});

describe("msUntilMidnight", () => {
  it("returns 1 hour at 23:00", () => {
    expect(msUntilMidnight(at(23, 0,),),).toBe(60 * 60 * 1000,);
  });

  it("returns a full day at 00:00", () => {
    expect(msUntilMidnight(at(0, 0,),),).toBe(24 * 60 * 60 * 1000,);
  });

  it("handles arbitrary times", () => {
    expect(msUntilMidnight(at(12, 30,),),).toBe((11 * 60 + 30) * 60 * 1000,);
  });
});
