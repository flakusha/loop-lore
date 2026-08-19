import { describe, expect, it, } from "bun:test";
import type { ContextSection, } from "./context-stats";
import { suggestTrims, } from "./trim-suggestions";

const sections: ContextSection[] = [
  { name: "chatHistory", tokens: 20_000, pct: 63, },
  { name: "lore", tokens: 2400, pct: 8, },
  { name: "memories", tokens: 100, pct: 0, },
  { name: "system", tokens: 800, pct: 3, },
];

describe("suggestTrims", () => {
  it("returns no suggestions at or below the threshold", () => {
    expect(suggestTrims(sections, 80,),).toEqual([],);
  });

  it("returns no suggestions just inside the threshold boundary", () => {
    expect(suggestTrims(sections, 79,),).toEqual([],);
  });

  it("emits suggestions once usage passes the threshold", () => {
    const out = suggestTrims(sections, 81,);
    expect(out.length,).toBeGreaterThan(0,);
    expect(out[0]!.section,).toBe("chatHistory",);
  });

  it("orders suggestions by largest section first", () => {
    const out = suggestTrims(sections, 90,);
    expect(out.map((s,) => s.section),).toEqual(["chatHistory", "lore", "system",],);
  });

  it("filters out sections below minTokens", () => {
    const out = suggestTrims(sections, 90,);
    // memories (100 tokens) and system (800 < 256? no) — 800 passes; only 100 dropped
    expect(out.some((s,) => s.section === "memories"),).toBe(false,);
    expect(out.some((s,) => s.section === "system"),).toBe(true,);
  });

  it("respects a custom minTokens option", () => {
    const out = suggestTrims(sections, 90, { minTokens: 1000, },);
    expect(out.map((s,) => s.section),).toEqual(["chatHistory", "lore",],);
  });

  it("respects a custom thresholdPct option", () => {
    const out = suggestTrims(sections, 70, { thresholdPct: 50, },);
    expect(out.length,).toBeGreaterThan(0,);
  });

  it("returns empty for no sections", () => {
    expect(suggestTrims([], 99,),).toEqual([],);
  });

  it("includes a human-readable, token-qualified message", () => {
    const out = suggestTrims(sections, 90,);
    const chat = out.find((s,) => s.section === "chatHistory");
    expect(chat?.message,).toContain("20,000",);
    expect(chat?.message,).toMatch(/archive older messages/,);
  });

  it("advises by message only when below threshold regardless of section sizes", () => {
    const huge = [{ name: "lore", tokens: 9000, pct: 28, },];
    expect(suggestTrims(huge, 79,),).toEqual([],);
  });
});
