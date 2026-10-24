import { describe, expect, it, } from "bun:test";
import { selectWithinBudget, } from "./budget";

describe("memory budget", () => {
  it("keeps the higher-confidence memory when budget forces a choice (equal importance)", () => {
    const mems = [
      { content: "hello", confidence: 0.9, importance: 0.5, pinned: false, },
      { content: "world", confidence: 0.1, importance: 0.5, pinned: false, },
    ];

    // Each memory costs 2 tokens (5 chars / 4, ceil); budget fits only one.
    const result = selectWithinBudget(mems, { maxTokens: 2, respectPins: true, },);
    expect(result.length,).toBe(1,);
    expect(result[0]!.content,).toBe("hello",);
  });

  it("respects pinned memories", () => {
    const mems = [
      { content: "pinned", confidence: 0.5, importance: 0.1, pinned: true, },
      { content: "low", confidence: 0.1, importance: 1.0, pinned: false, },
    ];

    const result = selectWithinBudget(mems, { maxTokens: 10, respectPins: true, },);
    expect(result.some((m: { content: string },) => m.content === "pinned"),).toBe(true,);
  });
});
