import { describe, expect, it, } from "bun:test";
import { formatTime, tzOffset, unixMs, unixSec, } from "./date";

describe("date pure logic (real assertions)", () => {
  it("unixMs returns number close to now", () => {
    const ms = unixMs();
    expect(typeof ms,).toBe("number",);
    expect(ms,).toBeGreaterThan(1_600_000_000_000,);
  });
  it("unixSec is floor of unixMs / 1000", () => {
    expect(unixSec(),).toBe(Math.floor(unixMs() / 1000,),);
  });
  it("tzOffset returns string matching offset pattern", () => {
    const s = tzOffset();
    expect(typeof s,).toBe("string",);
    expect(s,).toMatch(/^[+-]\d{2}:\d{2}$/,);
  });
  it("formatTime standard vs compact", () => {
    const d = new Date("2026-07-04T14:30:00Z",);
    const std = formatTime({ date: d, style: "standard", },);
    const cmp = formatTime({ date: d, style: "compact", },);
    expect(std,).toContain("2026-07-04",);
    expect(cmp,).toContain("20260704",);
  });
});
