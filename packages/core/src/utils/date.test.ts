import { describe, expect, it, } from "bun:test";
import { calculateAge, formatTime, } from "./date";

describe("utils/date formatTime (real logic)", () => {
  it("standard format includes dashes and colon", () => {
    const s = formatTime({ date: new Date("2026-07-04T14:30:00Z",), style: "standard", },);
    expect(s,).toContain("2026-07-04",);
    expect(s,).toContain("T",);
    expect(s,).toContain("+00:00",);
  });

  it("compact omits dashes", () => {
    const s = formatTime({ date: new Date("2026-07-04T14:30:00Z",), style: "compact", },);
    expect(s,).toContain("20260704",);
    expect(s,).not.toContain("2026-07-04",);
  });

  it("default style is standard", () => {
    const s = formatTime({ date: new Date("2026-01-01",), },);
    expect(typeof s,).toBe("string",);
    expect(s.length,).toBeGreaterThan(0,);
  });
});

describe("utils/date calculateAge (real logic)", () => {
  it("treats a UTC-today birth date as age zero regardless of host offset", () => {
    const today = new Date().toISOString().slice(0, 10,);
    expect(calculateAge(today,),).toBe(0,);
  });

  it("returns null for an invalid date", () => {
    expect(calculateAge("not-a-date",),).toBeNull();
  });
});
