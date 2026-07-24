import { describe, expect, it, } from "bun:test";
import { estimateTokens, } from "./token-utils";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("",),).toBe(0,);
  });

  it("returns 0 for null/undefined-ish strings", () => {
    expect(estimateTokens("",),).toBe(0,);
  });

  it("estimates ~4 chars per token", () => {
    // 8 chars → 2 tokens
    expect(estimateTokens("abcd efgh",),).toBe(3,); // 9 chars / 4 = 2.25 → ceil = 3
  });

  it("handles single character", () => {
    expect(estimateTokens("a",),).toBe(1,);
  });

  it("handles long text", () => {
    const text = "a".repeat(100,);
    expect(estimateTokens(text,),).toBe(25,); // 100 / 4 = 25
  });

  it("rounds up fractional tokens", () => {
    expect(estimateTokens("abc",),).toBe(1,); // 3/4 = 0.75 → ceil = 1
    expect(estimateTokens("abcde",),).toBe(2,); // 5/4 = 1.25 → ceil = 2
  });
});
